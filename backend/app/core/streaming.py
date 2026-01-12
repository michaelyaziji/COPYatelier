"""Streaming orchestration for real-time agent output."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator, Optional
from enum import Enum

from ..models.agent import AgentConfig, ProviderType
from ..models.session import SessionState, OrchestrationFlow
from ..models.exchange import ExchangeTurn, Evaluation
from ..providers import AIProvider, AnthropicProvider, GoogleProvider, OpenAIProvider
from .config import get_settings
from .evaluation import parse_evaluation
from .credits import calculate_credits

logger = logging.getLogger(__name__)


class StreamEventType(str, Enum):
    """Types of streaming events."""
    SESSION_START = "session_start"
    ROUND_START = "round_start"
    AGENT_START = "agent_start"
    AGENT_TOKEN = "agent_token"
    AGENT_COMPLETE = "agent_complete"
    ROUND_COMPLETE = "round_complete"
    SESSION_COMPLETE = "session_complete"
    SESSION_PAUSED = "session_paused"
    SESSION_RESUMED = "session_resumed"
    CREDITS_UPDATE = "credits_update"
    CREDIT_WARNING = "credit_warning"
    ERROR = "error"


class StreamingOrchestrator:
    """
    Streaming orchestration engine that yields events in real-time.

    This allows the frontend to display live agent output as it's generated.
    """

    def __init__(
        self,
        session_state: SessionState,
        user_id: Optional[str] = None,
        initial_balance: Optional[int] = None,
    ):
        self.state = session_state
        self.settings = get_settings()
        self.providers = self._initialize_providers()
        self.user_id = user_id

        # Credit tracking for this session
        self.session_credits_used = 0
        self.turn_usage_records: list[dict] = []  # Records per-turn usage
        self.initial_balance = initial_balance  # User's balance at session start
        self._credit_warning_sent = False  # Track if we've sent a low credit warning

    def _initialize_providers(self) -> dict[ProviderType, AIProvider]:
        """Initialize AI providers based on configured API keys."""
        providers = {}

        if self.settings.anthropic_api_key:
            providers[ProviderType.ANTHROPIC] = AnthropicProvider(
                api_key=self.settings.anthropic_api_key
            )

        if self.settings.google_api_key:
            providers[ProviderType.GOOGLE] = GoogleProvider(
                api_key=self.settings.google_api_key
            )

        if self.settings.openai_api_key:
            providers[ProviderType.OPENAI] = OpenAIProvider(
                api_key=self.settings.openai_api_key
            )

        return providers

    def _build_agent_prompt(self, agent: AgentConfig, is_first_turn: bool) -> str:
        """Build the complete prompt for an agent."""
        prompt_parts = []

        # 1. Reference materials (supporting documents - NOT what we're editing)
        if self.state.config.reference_documents:
            prompt_parts.append("=== REFERENCE MATERIALS ===\n")
            prompt_parts.append("(These are supporting documents for context only. Do NOT edit these.)\n")
            # Include user instructions about how to use the reference documents
            if self.state.config.reference_instructions:
                prompt_parts.append(f"\nHow to use these materials: {self.state.config.reference_instructions}\n")
            for filename, content in self.state.config.reference_documents.items():
                prompt_parts.append(f"\n--- {filename} ---\n{content}\n")
            prompt_parts.append("\n")

        # 2. Exchange history (if not first turn)
        if self.state.exchange_history:
            prompt_parts.append("=== EXCHANGE HISTORY ===\n")
            for turn in self.state.exchange_history:
                prompt_parts.append(f"\n[Round {turn.round_number}, Turn {turn.turn_number}] {turn.agent_name}:\n")
                prompt_parts.append(f"{turn.output}\n")

                if turn.evaluation:
                    prompt_parts.append(f"\nEvaluation (Overall: {turn.evaluation.overall_score:.1f}/10):\n")
                    for cs in turn.evaluation.criteria_scores:
                        prompt_parts.append(f"  - {cs.criterion}: {cs.score}/10 - {cs.justification}\n")
            prompt_parts.append("\n")

        # 3. Current working document (THE document being created/edited)
        current_doc = self._get_current_document()
        if current_doc:
            prompt_parts.append("=== WORKING DOCUMENT ===\n")
            prompt_parts.append("(This is the central document you are writing/editing.)\n\n")
            prompt_parts.append(f"{current_doc}\n")

        # Task instructions (role-specific)
        prompt_parts.append("\n=== YOUR TASK ===\n")
        prompt_parts.append(self._get_task_instructions(agent, is_first_turn, self.state.current_round))

        prompt_parts.append("\n\n=== EVALUATION FORMAT ===\n")
        prompt_parts.append(
            "After completing your task, provide a structured evaluation in the following JSON format:\n\n"
            "```json\n"
            "{\n"
            '  "output": "Your revised text or critique goes here",\n'
            '  "evaluation": {\n'
            '    "criteria_scores": [\n'
        )

        for criterion in agent.evaluation_criteria:
            prompt_parts.append(
                f'      {{"criterion": "{criterion.name}", "score": 7, "justification": "Brief explanation"}},\n'
            )

        prompt_parts.append(
            '    ],\n'
            '    "overall_score": 7.5,\n'
            '    "summary": "Brief overall assessment"\n'
            '  }\n'
            '}\n'
            '```\n\n'
            'Score each criterion from 1-10. The overall score should be the average of criterion scores.\n'
        )

        return "".join(prompt_parts)

    def _build_system_prompt(self, agent: AgentConfig) -> str:
        """Build the system prompt for an agent."""
        system_parts = [agent.role_description]
        system_parts.append("\n\nYou are participating in a multi-agent writing refinement process.")
        system_parts.append("\n\nYour evaluation criteria are:")

        for criterion in agent.evaluation_criteria:
            system_parts.append(f"\n- {criterion.name}: {criterion.description}")

        return "".join(system_parts)

    def _get_current_document(self) -> str:
        """Get the latest version of the working document."""
        if self.state.exchange_history:
            return self.state.exchange_history[-1].working_document
        return self.state.config.working_document

    def _update_working_document(self, agent: AgentConfig, agent_output: str) -> str:
        """
        Update the working document based on agent output.

        Only Writers (phase 1) update the document. Editors and Synthesizers
        provide feedback without modifying the document.
        """
        if agent.phase == 1:  # Writer
            return agent_output
        else:
            # Editors and Synthesizer don't change the document
            return self._get_current_document()

    def _aggregate_editor_feedback(self, round_number: int) -> str:
        """Aggregate feedback from all editors in a given round."""
        feedback_parts = []

        for turn in self.state.exchange_history:
            if turn.round_number == round_number:
                # Skip Writer turns (phase 1) - check by agent_id
                if turn.agent_id != "writer":
                    feedback_parts.append(f"### {turn.agent_name}\n{turn.output}\n")

        if not feedback_parts:
            return "(No editorial feedback from previous round)"

        return "\n---\n".join(feedback_parts)

    def _get_task_instructions(self, agent: AgentConfig, is_first_turn: bool, round_number: int) -> str:
        """Get task instructions based on agent role/phase."""
        if is_first_turn:
            return self.state.config.initial_prompt

        if agent.phase == 1:  # Writer
            return self._get_writer_revision_instructions(round_number)
        elif agent.phase == 2:  # Editors (Content Expert, Style Editor, Fact Checker)
            return self._get_editor_instructions(agent)
        elif agent.phase == 3:  # Synthesizer
            return self._get_synthesizer_instructions()
        else:
            return "Review and provide feedback on the current draft."

    def _get_writer_revision_instructions(self, round_number: int) -> str:
        """Build revision instructions for the Writer with aggregated feedback."""
        feedback = self._aggregate_editor_feedback(round_number - 1)

        return f"""Revise your draft based on the editorial feedback below.

=== EDITORIAL FEEDBACK ===
{feedback}
===========================

Instructions:
- Incorporate feedback that strengthens the work
- Push back (in your self-evaluation) on suggestions that would weaken it
- Preserve what's working
- Produce a complete revised draft"""

    def _get_editor_instructions(self, agent: AgentConfig) -> str:
        """Get instructions for editor roles."""
        base = "Review the WORKING DOCUMENT above and provide your editorial feedback.\n\n"

        role_instructions = {
            "content_expert": "Focus on: accuracy, completeness, intellectual depth. Flag oversimplifications, gaps, and claims that overreach evidence. Suggest specific additions.\n\nDo NOT rewrite the document. Provide feedback only.",
            "style_editor": "Focus on: sentence rhythm, word choice, transitions, clarity, economy. Cut throat-clearing, redundancy, jargon. Preserve the author's voice.\n\nDo NOT rewrite the document. Provide feedback only.",
            "fact_checker": "Focus on: verifiable claims, statistics, attributions. For each issue, specify what's claimed, why it's problematic, and what would resolve it.\n\nDo NOT rewrite the document. Provide feedback only.",
        }

        return base + role_instructions.get(agent.agent_id, "Provide editorial feedback. Do NOT rewrite the document.")

    def _get_synthesizer_instructions(self) -> str:
        """Get instructions for the Synthesizing Editor."""
        return """Review all editorial feedback from this round and produce a PRIORITIZED REVISION DIRECTIVE.

Your output should be:
1. A clear hierarchy of what MUST change, what SHOULD change, and what can be ignored
2. When editors conflict, make the call and explain your reasoning
3. Specific, actionable direction for the Writer

Do NOT rewrite the document. Produce a revision directive only."""

    def _get_agents_by_phase(self) -> dict[int, list[AgentConfig]]:
        """
        Group active agents by phase for proper execution order.

        Phase 1: Writer (creates/revises document)
        Phase 2: Editors (provide feedback)
        Phase 3: Synthesizer (prioritizes feedback)
        """
        active = [a for a in self.state.config.agents if a.is_active]
        phases: dict[int, list[AgentConfig]] = {1: [], 2: [], 3: []}
        for agent in active:
            phase = getattr(agent, 'phase', 2)  # Default to editor if not set
            if phase in phases:
                phases[phase].append(agent)
            else:
                phases[2].append(agent)  # Unknown phase defaults to editor
        return phases

    def _check_termination(self) -> Optional[str]:
        """Check if termination conditions are met."""
        if self.state.current_round >= self.state.config.termination.max_rounds:
            return f"Maximum rounds reached ({self.state.config.termination.max_rounds})"

        # Check score threshold - only based on synthesizer (phase 3) scores
        if self.state.config.termination.score_threshold:
            threshold = self.state.config.termination.score_threshold

            # Build a map of agent_id -> phase for quick lookup
            agent_phases = {
                agent.agent_id: agent.phase
                for agent in self.state.config.agents
                if agent.is_active
            }

            # Check if a synthesizer (phase 3) has evaluated and met threshold
            # Look through recent turns for phase 3 agent evaluations
            if self.state.exchange_history:
                for turn in reversed(self.state.exchange_history):
                    agent_phase = agent_phases.get(turn.agent_id, 1)
                    # Only consider phase 3 (synthesizer) scores for threshold
                    if agent_phase == 3 and turn.evaluation:
                        if turn.evaluation.overall_score >= threshold:
                            return (
                                f"Quality target reached: {turn.agent_name} scored "
                                f"{turn.evaluation.overall_score:.1f} (target: {threshold})"
                            )
                        # Found a phase 3 evaluation but didn't meet threshold
                        # Don't keep looking at older turns
                        break

        return None

    def _create_event(self, event_type: StreamEventType, data: dict) -> str:
        """Create a Server-Sent Event string."""
        event_data = {
            "type": event_type.value,
            "session_id": self.state.config.session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data
        }
        return f"data: {json.dumps(event_data)}\n\n"

    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate token count from text.

        Uses a simple heuristic: ~4 characters per token for English text.
        This provides a reasonable estimate for credit calculation.
        """
        return max(1, len(text) // 4)

    def _calculate_turn_credits(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
        response: str,
    ) -> dict:
        """
        Calculate token usage and credits for a single turn.

        Returns dict with input_tokens, output_tokens, and credits_used.
        """
        input_tokens = self._estimate_tokens(system_prompt + user_prompt)
        output_tokens = self._estimate_tokens(response)
        credits_used = calculate_credits(model, input_tokens, output_tokens)

        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "credits_used": credits_used,
        }

    async def run_streaming(self) -> AsyncIterator[str]:
        """
        Run orchestration with streaming output.

        Yields SSE-formatted events for real-time frontend updates.
        Executes agents in phase order: Phase 1 (Writer) → Phase 2 (Editors) → Phase 3 (Synthesizer)
        """
        logger.info("Starting streaming orchestration")

        self.state.is_running = True
        self.state.is_cancelled = False
        self.state.current_round = 0

        # Group agents by phase for proper execution order
        phases = self._get_agents_by_phase()
        active_agents = phases[1] + phases[2] + phases[3]

        if not active_agents:
            yield self._create_event(StreamEventType.ERROR, {
                "message": "No active agents configured"
            })
            return

        # Session start event
        yield self._create_event(StreamEventType.SESSION_START, {
            "session_id": self.state.config.session_id,
            "agent_count": len(active_agents),
            "agents": [{"id": a.agent_id, "name": a.display_name, "phase": getattr(a, 'phase', 2)} for a in active_agents],
            "max_rounds": self.state.config.termination.max_rounds,
        })

        turn_number = 0

        try:
            while True:
                # Check for cancellation
                if self.state.is_cancelled:
                    self.state.termination_reason = "Stopped by user"
                    yield self._create_event(StreamEventType.SESSION_COMPLETE, {
                        "reason": "Stopped by user",
                        "rounds_completed": self.state.current_round,
                        "turns_completed": len(self.state.exchange_history),
                    })
                    break

                self.state.current_round += 1

                # Round start event
                yield self._create_event(StreamEventType.ROUND_START, {
                    "round": self.state.current_round,
                    "max_rounds": self.state.config.termination.max_rounds,
                })

                # Execute agents in phase order: Phase 1 → Phase 2 → Phase 3
                for phase_num in [1, 2, 3]:
                    for agent in phases[phase_num]:
                        # Check for cancellation before each agent
                        if self.state.is_cancelled:
                            self.state.termination_reason = "Stopped by user"
                            break

                        # Check if user has enough credits to continue
                        # Estimate ~2 credits minimum per turn as a safety threshold
                        if self.initial_balance is not None:
                            remaining_credits = self.initial_balance - self.session_credits_used
                            if remaining_credits < 2:
                                self.state.termination_reason = "Insufficient credits"
                                self.state.is_running = False
                                yield self._create_event(StreamEventType.SESSION_COMPLETE, {
                                    "reason": "credit_depleted",
                                    "message": "Session stopped: insufficient credits remaining",
                                    "rounds_completed": self.state.current_round,
                                    "turns_completed": len(self.state.exchange_history),
                                    "credits_used": self.session_credits_used,
                                })
                                return

                        turn_number += 1
                        is_first_turn = turn_number == 1

                        # Agent start event
                        yield self._create_event(StreamEventType.AGENT_START, {
                            "agent_id": agent.agent_id,
                            "agent_name": agent.display_name,
                            "turn_number": turn_number,
                            "round_number": self.state.current_round,
                            "phase": getattr(agent, 'phase', 2),
                        })

                        # Get provider
                        provider = self.providers.get(agent.provider)
                        if not provider:
                            yield self._create_event(StreamEventType.ERROR, {
                                "message": f"Provider {agent.provider} not configured"
                            })
                            continue

                        # Build prompts
                        system_prompt = self._build_system_prompt(agent)
                        user_prompt = self._build_agent_prompt(agent, is_first_turn)

                        # Stream the response
                        full_response = ""
                        model_name = agent.model.value if hasattr(agent.model, 'value') else agent.model

                        try:
                            async for token in provider.generate_stream(
                                system_prompt=system_prompt,
                                user_prompt=user_prompt,
                                model=model_name,
                                temperature=0.7,
                            ):
                                full_response += token
                                # Send token event
                                yield self._create_event(StreamEventType.AGENT_TOKEN, {
                                    "agent_id": agent.agent_id,
                                    "token": token,
                                })

                        except Exception as e:
                            logger.error(f"Error streaming from {agent.display_name}: {e}")
                            yield self._create_event(StreamEventType.ERROR, {
                                "agent_id": agent.agent_id,
                                "message": str(e),
                            })
                            continue

                        # Parse evaluation
                        expected_criteria = [c.name for c in agent.evaluation_criteria]
                        evaluation, parse_error = parse_evaluation(full_response, expected_criteria)

                        # Extract output
                        if evaluation and '```json' in full_response:
                            try:
                                json_match = full_response.find('{')
                                if json_match != -1:
                                    data = json.loads(full_response[json_match:full_response.rfind('}')+1])
                                    output = data.get("output", full_response)
                            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
                                logger.warning(f"Failed to parse JSON output: {e}")
                                output = full_response
                        else:
                            output = full_response

                        # Update working document (only Writers update it)
                        updated_document = self._update_working_document(agent, output)

                        # Calculate token usage and credits
                        usage = self._calculate_turn_credits(
                            model=model_name,
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            response=full_response,
                        )
                        self.session_credits_used += usage["credits_used"]
                        self.turn_usage_records.append({
                            "turn_number": turn_number,
                            "agent_id": agent.agent_id,
                            "model": model_name,
                            **usage,
                        })

                        # Create exchange turn
                        turn = ExchangeTurn(
                            turn_number=turn_number,
                            round_number=self.state.current_round,
                            agent_id=agent.agent_id,
                            agent_name=agent.display_name,
                            timestamp=datetime.now(timezone.utc),
                            output=output,
                            raw_response=full_response,
                            evaluation=evaluation,
                            parse_error=parse_error,
                            working_document=updated_document,
                            tokens_input=usage["input_tokens"],
                            tokens_output=usage["output_tokens"],
                            credits_used=usage["credits_used"],
                        )

                        self.state.exchange_history.append(turn)

                        # Agent complete event with credit info
                        yield self._create_event(StreamEventType.AGENT_COMPLETE, {
                            "agent_id": agent.agent_id,
                            "agent_name": agent.display_name,
                            "turn_number": turn_number,
                            "evaluation": {
                                "overall_score": evaluation.overall_score if evaluation else None,
                                "criteria_scores": [
                                    {"criterion": cs.criterion, "score": cs.score}
                                    for cs in (evaluation.criteria_scores if evaluation else [])
                                ],
                            } if evaluation else None,
                            "output_length": len(output),
                            "usage": {
                                "input_tokens": usage["input_tokens"],
                                "output_tokens": usage["output_tokens"],
                                "credits_used": usage["credits_used"],
                                "session_total_credits": self.session_credits_used,
                            },
                        })

                        # Emit credit warning if balance is getting low (< 5 credits remaining)
                        if self.initial_balance is not None and not self._credit_warning_sent:
                            remaining_credits = self.initial_balance - self.session_credits_used
                            if remaining_credits < 5:
                                self._credit_warning_sent = True
                                yield self._create_event(StreamEventType.CREDIT_WARNING, {
                                    "remaining_credits": remaining_credits,
                                    "session_credits_used": self.session_credits_used,
                                    "message": "Low credits - session may stop soon",
                                })

                        # Check for pause after each agent completes
                        if self.state.is_paused:
                            yield self._create_event(StreamEventType.SESSION_PAUSED, {
                                "after_agent": agent.display_name,
                                "turn_number": turn_number,
                                "round_number": self.state.current_round,
                            })
                            # Wait until resumed or cancelled
                            while self.state.is_paused and not self.state.is_cancelled:
                                await asyncio.sleep(0.5)
                            # If resumed (not cancelled), send resumed event
                            if not self.state.is_cancelled:
                                yield self._create_event(StreamEventType.SESSION_RESUMED, {
                                    "turn_number": turn_number,
                                    "round_number": self.state.current_round,
                                })

                    # Check if we need to break out of the phase loop due to cancellation
                    if self.state.is_cancelled:
                        break

                # Exit if cancelled during the round
                if self.state.is_cancelled:
                    yield self._create_event(StreamEventType.SESSION_COMPLETE, {
                        "reason": "Stopped by user",
                        "rounds_completed": self.state.current_round,
                        "turns_completed": len(self.state.exchange_history),
                    })
                    break

                # Round complete event
                yield self._create_event(StreamEventType.ROUND_COMPLETE, {
                    "round": self.state.current_round,
                    "turns_in_round": len(active_agents),
                })

                # Check termination
                termination_reason = self._check_termination()
                if termination_reason:
                    self.state.termination_reason = termination_reason

                    # Final Writer pass to incorporate Synthesizer's feedback
                    if phases[1] and not self.state.is_cancelled:
                        writer = phases[1][0]  # Get the Writer agent
                        turn_number += 1

                        # Signal final polish pass
                        yield self._create_event(StreamEventType.ROUND_START, {
                            "round": self.state.current_round,
                            "max_rounds": self.state.config.termination.max_rounds,
                            "is_final_pass": True,
                        })

                        yield self._create_event(StreamEventType.AGENT_START, {
                            "agent_id": writer.agent_id,
                            "agent_name": writer.display_name,
                            "turn_number": turn_number,
                            "round_number": self.state.current_round,
                            "phase": 1,
                            "is_final_pass": True,
                        })

                        provider = self.providers.get(writer.provider)
                        if provider:
                            system_prompt = self._build_system_prompt(writer)
                            # Special final pass prompt
                            user_prompt = self._build_agent_prompt(writer, is_first_turn=False)

                            full_response = ""
                            model_name = writer.model.value if hasattr(writer.model, 'value') else writer.model

                            try:
                                async for token in provider.generate_stream(
                                    system_prompt=system_prompt,
                                    user_prompt=user_prompt,
                                    model=model_name,
                                    temperature=0.7,
                                ):
                                    full_response += token
                                    yield self._create_event(StreamEventType.AGENT_TOKEN, {
                                        "agent_id": writer.agent_id,
                                        "token": token,
                                    })

                                # Parse and record
                                expected_criteria = [c.name for c in writer.evaluation_criteria]
                                evaluation, parse_error = parse_evaluation(full_response, expected_criteria)

                                if evaluation and '```json' in full_response:
                                    try:
                                        json_match = full_response.find('{')
                                        if json_match != -1:
                                            data = json.loads(full_response[json_match:full_response.rfind('}')+1])
                                            output = data.get("output", full_response)
                                    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                                        output = full_response
                                else:
                                    output = full_response

                                updated_document = self._update_working_document(writer, output)

                                usage = self._calculate_turn_credits(
                                    model=model_name,
                                    system_prompt=system_prompt,
                                    user_prompt=user_prompt,
                                    response=full_response,
                                )
                                self.session_credits_used += usage["credits_used"]

                                turn = ExchangeTurn(
                                    turn_number=turn_number,
                                    round_number=self.state.current_round,
                                    agent_id=writer.agent_id,
                                    agent_name=writer.display_name,
                                    timestamp=datetime.now(timezone.utc),
                                    output=output,
                                    raw_response=full_response,
                                    evaluation=evaluation,
                                    parse_error=parse_error,
                                    working_document=updated_document,
                                    tokens_input=usage["input_tokens"],
                                    tokens_output=usage["output_tokens"],
                                    credits_used=usage["credits_used"],
                                )
                                self.state.exchange_history.append(turn)

                                yield self._create_event(StreamEventType.AGENT_COMPLETE, {
                                    "agent_id": writer.agent_id,
                                    "agent_name": writer.display_name,
                                    "turn_number": turn_number,
                                    "is_final_pass": True,
                                    "evaluation": {
                                        "overall_score": evaluation.overall_score if evaluation else None,
                                        "criteria_scores": [
                                            {"criterion": cs.criterion, "score": cs.score}
                                            for cs in (evaluation.criteria_scores if evaluation else [])
                                        ],
                                    } if evaluation else None,
                                    "usage": {
                                        "input_tokens": usage["input_tokens"],
                                        "output_tokens": usage["output_tokens"],
                                        "credits_used": usage["credits_used"],
                                        "session_total_credits": self.session_credits_used,
                                    },
                                })
                            except Exception as e:
                                logger.error(f"Error in final Writer pass: {e}")

                    yield self._create_event(StreamEventType.SESSION_COMPLETE, {
                        "reason": termination_reason,
                        "rounds_completed": self.state.current_round,
                        "turns_completed": len(self.state.exchange_history),
                    })
                    break

        finally:
            self.state.is_running = False
