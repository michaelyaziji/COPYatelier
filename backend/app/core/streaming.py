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
from ..providers import AIProvider, AnthropicProvider, GoogleProvider, OpenAIProvider, PerplexityProvider
from .config import get_settings
from .evaluation import parse_evaluation
from .credits import calculate_credits
from .provider_health import health_tracker

logger = logging.getLogger(__name__)


def extract_content_from_response(full_response: str) -> str:
    """
    Extract and format content from an AI response that may contain JSON.

    Strategy:
    1. If there's real prose BEFORE a JSON block, return that prose (includes reasoning)
    2. If the entire content is a JSON block, extract and format ALL fields (thinking, reasoning, output, etc.)

    Args:
        full_response: The complete AI response including any JSON block

    Returns:
        The extracted and formatted content
    """
    import re

    if not full_response:
        return ""

    cleaned = full_response.strip()

    # Check if there's content BEFORE a ```json block
    json_block_start = cleaned.find('```json')
    if json_block_start > 0:
        before_json = cleaned[:json_block_start].strip()
        # Make sure it's real prose, not just backticks
        if before_json and not re.match(r'^`*$', before_json):
            return before_json

    # Check if content starts with JSON (code block or raw)
    if cleaned.startswith('```json') or cleaned.startswith('```\n{') or cleaned.startswith('{'):
        # Strip code fences first
        cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned)
        cleaned = re.sub(r'\n?```\s*$', '', cleaned)
        cleaned = cleaned.strip()

        # Try to parse JSON and extract ALL fields (not just output)
        if cleaned.startswith('{'):
            try:
                json_end = cleaned.rfind('}')
                if json_end != -1:
                    data = json.loads(cleaned[:json_end + 1])
                    parts = []

                    # Add thinking/reasoning if present
                    if data.get("thinking"):
                        parts.append(f"**Thinking:**\n{data['thinking']}")
                    if data.get("reasoning"):
                        parts.append(f"**Reasoning:**\n{data['reasoning']}")
                    if data.get("analysis"):
                        parts.append(f"**Analysis:**\n{data['analysis']}")
                    if data.get("comments"):
                        parts.append(f"**Comments:**\n{data['comments']}")
                    if data.get("feedback"):
                        parts.append(f"**Feedback:**\n{data['feedback']}")
                    if data.get("suggestions"):
                        parts.append(f"**Suggestions:**\n{data['suggestions']}")
                    if data.get("changes"):
                        parts.append(f"**Changes Made:**\n{data['changes']}")

                    # Add the output (no label - it's the main content)
                    if data.get("output"):
                        parts.append(data["output"])

                    if parts:
                        return "\n\n".join(parts)
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                pass

            # JSON parsing failed - try regex to extract all fields
            field_patterns = [
                ("thinking", "Thinking"),
                ("reasoning", "Reasoning"),
                ("analysis", "Analysis"),
                ("comments", "Comments"),
                ("feedback", "Feedback"),
                ("suggestions", "Suggestions"),
                ("changes", "Changes Made"),
                ("output", "Output"),
            ]

            sections = []
            for key, label in field_patterns:
                match = re.search(rf'"{key}"\s*:\s*"((?:[^"\\]|\\.)*)"', cleaned)
                if match:
                    value = match.group(1)
                    value = value.replace('\\n', '\n')
                    value = value.replace('\\t', '\t')
                    value = value.replace('\\"', '"')
                    value = value.replace('\\\\', '\\')
                    value = value.strip()
                    if value:
                        # Output is the main content, no label needed
                        if key == "output":
                            sections.append(value)
                        else:
                            sections.append(f"**{label}:**\n{value}")

            if sections:
                return "\n\n".join(sections)

        return cleaned if cleaned else full_response

    # Content doesn't start with JSON - check for JSON at the end
    raw_json_match = re.search(r'\n\{\s*"(?:output|evaluation)"', cleaned)
    if raw_json_match and raw_json_match.start() > 0:
        before_json = cleaned[:raw_json_match.start()].strip()
        if before_json:
            return before_json

    return cleaned


class StreamEventType(str, Enum):
    """Types of streaming events."""
    SESSION_START = "session_start"
    ROUND_START = "round_start"
    AGENT_START = "agent_start"
    AGENT_TOKEN = "agent_token"
    AGENT_RETRY = "agent_retry"
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
        self._current_round_editor_feedback = ""  # Stores editor feedback for Synthesizer

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

        if self.settings.perplexity_api_key:
            providers[ProviderType.PERPLEXITY] = PerplexityProvider(
                api_key=self.settings.perplexity_api_key
            )

        return providers

    def _build_agent_prompt(self, agent: AgentConfig, is_first_turn: bool, is_final_pass: bool = False) -> str:
        """
        Build the complete prompt for an agent with optimized context.

        Each role receives only the context it needs:
        - Writer (Round 1): User prompt + reference materials
        - Writer (Round 2+): Current draft + Synthesizer's directive
        - Editors: Current draft only (no history)
        - Synthesizer: Current draft + this round's editor feedback

        Args:
            agent: The agent configuration
            is_first_turn: Whether this is the first turn of the session
            is_final_pass: Whether this is the final Writer pass after termination
        """
        if agent.phase == 1:  # Writer
            return self._build_writer_prompt(agent, is_first_turn, is_final_pass)
        elif agent.phase == 2:  # Editors
            return self._build_editor_prompt(agent)
        elif agent.phase == 3:  # Synthesizer
            return self._build_synthesizer_prompt(agent)
        else:
            # Fallback to editor behavior
            return self._build_editor_prompt(agent)

    def _build_writer_prompt(self, agent: AgentConfig, is_first_turn: bool, is_final_pass: bool = False) -> str:
        """Build prompt for Writer with minimal context."""
        prompt_parts = []

        if is_first_turn:
            # Round 1: User prompt + reference materials + draft (if present)

            # Always include project/reference instructions if present
            if self.state.config.reference_instructions:
                prompt_parts.append("=== PROJECT INSTRUCTIONS ===\n")
                prompt_parts.append("(Follow these instructions for all outputs in this project.)\n\n")
                prompt_parts.append(f"{self.state.config.reference_instructions}\n\n")

            if self.state.config.reference_documents:
                prompt_parts.append("=== REFERENCE MATERIALS ===\n")
                prompt_parts.append("(These are supporting documents for context only. Do NOT edit these.)\n")
                for filename, content in self.state.config.reference_documents.items():
                    prompt_parts.append(f"\n--- {filename} ---\n{content}\n")
                prompt_parts.append("\n")

            # Include user's draft if present
            if self.state.config.working_document:
                prompt_parts.append("=== USER'S DRAFT ===\n")
                prompt_parts.append("(The user has provided this draft to work from.)\n\n")
                prompt_parts.append(f"{self.state.config.working_document}\n\n")

                # Add draft treatment instructions if specified
                draft_treatment_instructions = self._get_draft_treatment_instructions()
                if draft_treatment_instructions:
                    prompt_parts.append("=== DRAFT TREATMENT ===\n")
                    prompt_parts.append(f"{draft_treatment_instructions}\n\n")

            prompt_parts.append("=== YOUR TASK ===\n")
            prompt_parts.append(self.state.config.initial_prompt)
            prompt_parts.append("\n\nIMPORTANT: You are the WRITER. Your job is to PRODUCE THE ACTUAL DOCUMENT TEXT.")
            prompt_parts.append("\nDo NOT describe what you're going to write - actually write it.")
            prompt_parts.append("\nOUTPUT: The complete document text.")
        else:
            # Round 2+ or final pass: Current draft + Synthesizer's directive only

            # Always include project/reference instructions if present
            if self.state.config.reference_instructions:
                prompt_parts.append("=== PROJECT INSTRUCTIONS ===\n")
                prompt_parts.append("(Follow these instructions for all outputs in this project.)\n\n")
                prompt_parts.append(f"{self.state.config.reference_instructions}\n\n")

            prompt_parts.append("=== ORIGINAL TASK ===\n")
            prompt_parts.append("(The user's original request — this is your primary directive and takes precedence over editor suggestions:)\n\n")
            prompt_parts.append(f"{self.state.config.initial_prompt}\n\n")

            # Include reference materials for context
            if self.state.config.reference_documents:
                prompt_parts.append("=== REFERENCE MATERIALS ===\n")
                prompt_parts.append("(These are supporting documents for context only. Do NOT edit these.)\n")
                for filename, content in self.state.config.reference_documents.items():
                    prompt_parts.append(f"\n--- {filename} ---\n{content}\n")
                prompt_parts.append("\n")

            current_doc = self._get_current_document()
            if current_doc:
                prompt_parts.append("=== WORKING DOCUMENT ===\n")
                prompt_parts.append("(This is the current draft you are revising.)\n\n")
                prompt_parts.append(f"{current_doc}\n\n")

            # For final pass: use current round's directive
            # For normal rounds: use previous round's directive
            directive_round = self.state.current_round if is_final_pass else self.state.current_round - 1
            synthesizer_directive = self._get_synthesizer_directive(directive_round)
            prompt_parts.append("=== YOUR TASK ===\n")
            prompt_parts.append(f"""Revise your draft based on the Synthesizing Editor's directive below.

=== REVISION DIRECTIVE ===
{synthesizer_directive}
===========================

IMPORTANT: You are the WRITER. Your job is to PRODUCE THE ACTUAL DOCUMENT TEXT.

Instructions:
- The user's ORIGINAL TASK above is your ultimate authority — always honor their stated requirements, tone, audience, and intent
- Incorporate editorial feedback that aligns with the user's goals
- Reject or modify suggestions that would contradict what the user asked for
- Preserve what works

OUTPUT: Write the complete, revised document. Do NOT provide suggestions or feedback - output the actual text of the document.""")

        # Add evaluation format
        prompt_parts.append(self._get_evaluation_format(agent, is_writer=True))

        return "".join(prompt_parts)

    def _build_editor_prompt(self, agent: AgentConfig) -> str:
        """Build prompt for Editors with current draft and original task context."""
        prompt_parts = []

        # Project instructions so editors evaluate against them
        if self.state.config.reference_instructions:
            prompt_parts.append("=== PROJECT INSTRUCTIONS ===\n")
            prompt_parts.append("(These are project-level requirements. Evaluate the document against these instructions.)\n\n")
            prompt_parts.append(f"{self.state.config.reference_instructions}\n\n")

        # Original task so editors understand the intent/requirements
        prompt_parts.append("=== ORIGINAL TASK ===\n")
        prompt_parts.append("(The user's original request — this defines the requirements. Your feedback must respect and support what the user asked for:)\n\n")
        prompt_parts.append(f"{self.state.config.initial_prompt}\n\n")

        # Current draft to review
        current_doc = self._get_current_document()
        if current_doc:
            prompt_parts.append("=== WORKING DOCUMENT ===\n")
            prompt_parts.append("(This is the document you are reviewing.)\n\n")
            prompt_parts.append(f"{current_doc}\n\n")

        prompt_parts.append("=== YOUR TASK ===\n")
        prompt_parts.append(self._get_editor_instructions(agent))

        # Add evaluation format
        prompt_parts.append(self._get_evaluation_format(agent, is_writer=False))

        return "".join(prompt_parts)

    def _build_synthesizer_prompt(self, agent: AgentConfig) -> str:
        """Build prompt for Synthesizer with current draft + this round's editor feedback."""
        prompt_parts = []

        # Project instructions so synthesizer respects them when creating directives
        if self.state.config.reference_instructions:
            prompt_parts.append("=== PROJECT INSTRUCTIONS ===\n")
            prompt_parts.append("(These are project-level requirements. Ensure your directives align with these instructions.)\n\n")
            prompt_parts.append(f"{self.state.config.reference_instructions}\n\n")

        # Original task so synthesizer understands the intent
        prompt_parts.append("=== ORIGINAL TASK ===\n")
        prompt_parts.append("(The user's original request — this is the ultimate authority. Reject any editor feedback that would contradict the user's stated requirements:)\n\n")
        prompt_parts.append(f"{self.state.config.initial_prompt}\n\n")

        # Current document
        current_doc = self._get_current_document()
        if current_doc:
            prompt_parts.append("=== WORKING DOCUMENT ===\n")
            prompt_parts.append("(This is the current draft being reviewed.)\n\n")
            prompt_parts.append(f"{current_doc}\n\n")

        # Get ONLY this round's editor feedback (from current_round_editor_feedback)
        editor_feedback = self._get_current_round_editor_feedback()
        prompt_parts.append("=== EDITOR FEEDBACK (THIS ROUND) ===\n")
        prompt_parts.append(editor_feedback)
        prompt_parts.append("\n\n")

        prompt_parts.append("=== YOUR TASK ===\n")
        prompt_parts.append(self._get_synthesizer_instructions())

        # Add evaluation format
        prompt_parts.append(self._get_evaluation_format(agent, is_writer=False))

        return "".join(prompt_parts)

    def _get_synthesizer_directive(self, round_number: int) -> str:
        """Get the Synthesizer's directive from a specific round."""
        for turn in reversed(self.state.exchange_history):
            if turn.round_number == round_number and turn.agent_id == "synthesizer":
                return turn.output
        return "(No directive from previous round)"

    def _get_current_round_editor_feedback(self) -> str:
        """Get feedback from all editors in the current round (stored during parallel execution)."""
        # This will be populated during parallel editor execution
        if hasattr(self, '_current_round_editor_feedback') and self._current_round_editor_feedback:
            return self._current_round_editor_feedback

        # Fallback: collect from exchange history for current round
        feedback_parts = []
        for turn in self.state.exchange_history:
            if turn.round_number == self.state.current_round and turn.agent_id not in ("writer", "synthesizer"):
                feedback_parts.append(f"### {turn.agent_name}\n{turn.output}\n")

        if not feedback_parts:
            return "(No editor feedback yet)"

        return "\n---\n".join(feedback_parts)

    def _get_evaluation_format(self, agent: AgentConfig, is_writer: bool) -> str:
        """Get the evaluation format instructions."""
        output_description = "The complete document text (not suggestions - the actual content)" if is_writer else "Your editorial feedback or critique"

        parts = ["\n\n=== EVALUATION FORMAT ===\n"]
        parts.append(
            "After completing your task, provide a structured evaluation in the following JSON format:\n\n"
            "```json\n"
            "{\n"
            f'  "output": "{output_description}",\n'
            '  "evaluation": {\n'
            '    "criteria_scores": [\n'
        )

        for criterion in agent.evaluation_criteria:
            parts.append(
                f'      {{"criterion": "{criterion.name}", "score": 7, "justification": "Brief explanation"}},\n'
            )

        parts.append(
            '    ],\n'
            '    "overall_score": 7.5,\n'
            '    "summary": "Brief overall assessment"\n'
            '  }\n'
            '}\n'
            '```\n\n'
            'Score each criterion from 1-10. The overall score should be the average of criterion scores.\n'
        )

        return "".join(parts)

    def _build_system_prompt(self, agent: AgentConfig) -> str:
        """Build the system prompt for an agent."""
        system_parts = [agent.role_description]
        system_parts.append("\n\nYou are participating in a multi-agent writing refinement process.")
        system_parts.append("\n\nYour evaluation criteria are:")

        for criterion in agent.evaluation_criteria:
            system_parts.append(f"\n- {criterion.name}: {criterion.description}")

        return "".join(system_parts)

    def _get_draft_treatment_instructions(self) -> Optional[str]:
        """Get draft treatment instructions based on the user's selection."""
        treatment = self.state.config.draft_treatment
        if not treatment:
            return None

        instructions = {
            "light_polish": (
                "The user has provided a draft. Preserve their structure, organization, voice, and key phrasing. "
                "Fix errors, improve clarity, and smooth awkward passages, but do not reorganize or substantially rewrite. "
                "The output should feel like a polished version of their draft, not a new document."
            ),
            "moderate_revision": (
                "The user has provided a draft. Retain their core ideas and overall argument, but feel free to improve "
                "sentence structure, word choice, and flow. You may reorganize paragraphs if it strengthens the piece, "
                "but maintain the original intent and tone."
            ),
            "free_rewrite": (
                "The user has provided a draft as a starting point. Use their ideas and content as inspiration, "
                "but feel free to restructure, reframe, and rewrite substantially. "
                "The output may differ significantly in organization and voice."
            ),
        }

        return instructions.get(treatment)

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

    def _get_editor_instructions(self, agent: AgentConfig) -> str:
        """Get instructions for editor roles."""
        base = """Review the WORKING DOCUMENT above and provide your editorial feedback.

IMPORTANT: The user's ORIGINAL TASK defines what success looks like. Your suggestions must support — not contradict — the user's stated requirements, tone, audience, and intent. If the user asked for a casual tone, don't suggest making it formal. If they want it brief, don't suggest expanding it.

"""

        role_instructions = {
            "content_expert": "Focus on: accuracy, completeness, intellectual depth. Flag oversimplifications, gaps, and claims that overreach evidence. Suggest specific additions.\n\nDo NOT rewrite the document. Provide feedback only.",
            "style_editor": "Focus on: sentence rhythm, word choice, transitions, clarity, economy. Cut throat-clearing, redundancy, jargon. Preserve the author's voice and honor their stated tone preferences.\n\nDo NOT rewrite the document. Provide feedback only.",
            "fact_checker": "Focus on: verifiable claims, statistics, attributions. For each issue, specify what's claimed, why it's problematic, and what would resolve it.\n\nDo NOT rewrite the document. Provide feedback only.",
        }

        return base + role_instructions.get(agent.agent_id, "Provide editorial feedback. Do NOT rewrite the document.")

    def _get_synthesizer_instructions(self) -> str:
        """Get instructions for the Synthesizing Editor."""
        return """Review all editorial feedback from this round and produce a PRIORITIZED REVISION DIRECTIVE.

CRITICAL: The user's ORIGINAL TASK is the ultimate authority. When evaluating editor feedback:
- Accept suggestions that help achieve what the user asked for
- Reject suggestions that would contradict the user's stated requirements, tone, audience, or intent
- If an editor suggests something that conflicts with the user's request, explicitly note it should be ignored

Your output should be:
1. A clear hierarchy of what MUST change, what SHOULD change, and what can be ignored
2. When editors conflict, defer to whichever suggestion better serves the user's original request
3. Specific, actionable direction for the Writer

Do NOT rewrite the document. Produce a revision directive only."""

    def _get_agents_by_phase(self) -> dict[int, list[AgentConfig]]:
        """
        Group active agents by phase for proper execution order.

        Phase 1: Writer (creates/revises document)
        Phase 2: Editors (provide feedback) - run in PARALLEL
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

    async def _run_single_editor_streaming(
        self,
        agent: AgentConfig,
        turn_number: int,
        event_queue: asyncio.Queue,
    ) -> dict:
        """
        Run a single editor agent with real-time streaming via queue.

        Used for parallel execution of Phase 2 editors.
        Puts events into the queue as they occur for real-time streaming.
        Returns a dict with turn data and success status.
        """
        result = {
            "success": False,
            "turn": None,
            "usage": None,
            "agent_id": agent.agent_id,
            "output": None,
        }

        # Agent start event
        await event_queue.put(self._create_event(StreamEventType.AGENT_START, {
            "agent_id": agent.agent_id,
            "agent_name": agent.display_name,
            "turn_number": turn_number,
            "round_number": self.state.current_round,
            "phase": 2,
            "parallel": True,
        }))

        # Get provider
        provider = self.providers.get(agent.provider)
        if not provider:
            await event_queue.put(self._create_event(StreamEventType.ERROR, {
                "message": f"Provider {agent.provider} not configured"
            }))
            return result

        # Build prompts
        system_prompt = self._build_system_prompt(agent)
        user_prompt = self._build_agent_prompt(agent, is_first_turn=False)

        # Generate response with real-time token streaming and accurate usage tracking
        model_name = agent.model.value if hasattr(agent.model, 'value') else agent.model
        streaming_result = None

        # Token callback that puts events into the queue for real-time streaming
        # Uses put_nowait since we're in the same event loop
        def on_token(token: str):
            event_queue.put_nowait(self._create_event(StreamEventType.AGENT_TOKEN, {
                "agent_id": agent.agent_id,
                "token": token,
            }))

        try:
            # Use generate_stream_with_usage for accurate token counts
            streaming_result = await provider.generate_stream_with_usage(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model_name,
                temperature=0.7,
                on_token=on_token,
            )

            # Record successful API call
            health_tracker.record_success(agent.provider)

        except Exception as e:
            error_str = str(e).lower()
            is_overload = 'overload' in error_str or 'rate' in error_str or '529' in error_str or '429' in error_str

            health_tracker.record_failure(agent.provider, str(e), is_overload=is_overload)

            if is_overload:
                if agent.provider == ProviderType.ANTHROPIC:
                    alt_suggestion = "GPT-4o or Gemini"
                elif agent.provider == ProviderType.OPENAI:
                    alt_suggestion = "Claude or Gemini"
                else:
                    alt_suggestion = "Claude or GPT-4o"

                logger.error(f"Error streaming from {agent.display_name} (overloaded): {e}")
                await event_queue.put(self._create_event(StreamEventType.ERROR, {
                    "agent_id": agent.agent_id,
                    "message": f"The AI service is currently overloaded. Please wait a moment and try again, or switch to a different model (e.g., {alt_suggestion}).",
                    "error_type": "overload",
                }))
            else:
                logger.error(f"Error streaming from {agent.display_name}: {e}")
                await event_queue.put(self._create_event(StreamEventType.ERROR, {
                    "agent_id": agent.agent_id,
                    "message": str(e),
                }))
            return result

        # Parse evaluation using the content from streaming result
        full_response = streaming_result.content
        expected_criteria = [c.name for c in agent.evaluation_criteria]
        evaluation, parse_error = parse_evaluation(full_response, expected_criteria)

        # Extract output
        output = extract_content_from_response(full_response)
        result["output"] = output

        # Get current document (editors don't modify it)
        current_doc = self._get_current_document()

        # Calculate usage with actual token counts from API
        usage = self._calculate_turn_credits(
            model=model_name,
            input_tokens=streaming_result.input_tokens,
            output_tokens=streaming_result.output_tokens,
        )
        result["usage"] = usage

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
            working_document=current_doc,
            tokens_input=usage["input_tokens"],
            tokens_output=usage["output_tokens"],
            credits_used=usage["credits_used"],
        )
        result["turn"] = turn

        # Agent complete event
        await event_queue.put(self._create_event(StreamEventType.AGENT_COMPLETE, {
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
            },
            "parallel": True,
        }))

        result["success"] = True
        return result

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

    def _calculate_turn_credits(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> dict:
        """
        Calculate credits for a single turn using actual token counts.

        Args:
            model: Model identifier string
            input_tokens: Actual input tokens from API response
            output_tokens: Actual output tokens from API response

        Returns dict with input_tokens, output_tokens, and credits_used.
        """
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

                # Execute agents in phase order: Phase 1 → Phase 2 (PARALLEL) → Phase 3
                # Reset editor feedback storage for this round
                self._current_round_editor_feedback = ""

                for phase_num in [1, 2, 3]:
                    # Check for cancellation before each phase
                    if self.state.is_cancelled:
                        self.state.termination_reason = "Stopped by user"
                        break

                    # PHASE 2: Run editors in PARALLEL with real-time streaming
                    if phase_num == 2 and phases[2]:
                        # Check credits before starting parallel editors
                        if self.initial_balance is not None:
                            remaining_credits = self.initial_balance - self.session_credits_used
                            editors_count = len(phases[2])
                            if remaining_credits < editors_count * 2:
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

                        # Assign turn numbers for parallel editors
                        editor_turn_numbers = {}
                        for agent in phases[2]:
                            turn_number += 1
                            editor_turn_numbers[agent.agent_id] = turn_number

                        # Create event queue for real-time streaming from parallel editors
                        event_queue: asyncio.Queue = asyncio.Queue()

                        # Run all editors in parallel with streaming
                        logger.info(f"Running {len(phases[2])} editors in parallel with streaming")
                        editor_tasks = [
                            self._run_single_editor_streaming(agent, editor_turn_numbers[agent.agent_id], event_queue)
                            for agent in phases[2]
                        ]

                        # Start all editor tasks
                        tasks = [asyncio.create_task(task) for task in editor_tasks]

                        # Stream events from queue while editors are running
                        completed_count = 0
                        total_editors = len(phases[2])

                        while completed_count < total_editors:
                            # Check if any tasks completed
                            for task in tasks:
                                if task.done() and not hasattr(task, '_counted'):
                                    task._counted = True
                                    completed_count += 1

                            # Try to get events from queue (non-blocking with small timeout)
                            try:
                                event = await asyncio.wait_for(event_queue.get(), timeout=0.05)
                                yield event
                            except asyncio.TimeoutError:
                                # No event ready, continue checking tasks
                                await asyncio.sleep(0.01)

                        # Drain any remaining events from queue
                        while not event_queue.empty():
                            event = await event_queue.get()
                            yield event

                        # Collect results from completed tasks
                        editor_results = [task.result() for task in tasks]

                        # Process results
                        editor_feedback_parts = []
                        for result in editor_results:
                            if isinstance(result, Exception):
                                logger.error(f"Editor task failed: {result}")
                                continue

                            # Add turn to exchange history
                            if result.get("turn"):
                                self.state.exchange_history.append(result["turn"])

                            # Accumulate usage
                            if result.get("usage"):
                                self.session_credits_used += result["usage"]["credits_used"]
                                self.turn_usage_records.append({
                                    "turn_number": editor_turn_numbers[result["agent_id"]],
                                    "agent_id": result["agent_id"],
                                    "model": result["turn"].agent_name if result.get("turn") else "unknown",
                                    **result["usage"],
                                })

                            # Collect editor feedback for Synthesizer
                            if result.get("success") and result.get("output"):
                                turn_obj = result["turn"]
                                editor_feedback_parts.append(f"### {turn_obj.agent_name}\n{result['output']}\n")

                        # Store aggregated editor feedback for Synthesizer
                        self._current_round_editor_feedback = "\n---\n".join(editor_feedback_parts) if editor_feedback_parts else "(No editor feedback)"

                        # Credit warning check after parallel editors
                        if self.initial_balance is not None and not self._credit_warning_sent:
                            remaining_credits = self.initial_balance - self.session_credits_used
                            if remaining_credits < 5:
                                self._credit_warning_sent = True
                                yield self._create_event(StreamEventType.CREDIT_WARNING, {
                                    "remaining_credits": remaining_credits,
                                    "session_credits_used": self.session_credits_used,
                                    "message": "Low credits - session may stop soon",
                                })

                        continue  # Skip the sequential loop for Phase 2

                    # PHASE 1 & 3: Run sequentially with streaming
                    for agent in phases[phase_num]:
                        # Check for cancellation before each agent
                        if self.state.is_cancelled:
                            self.state.termination_reason = "Stopped by user"
                            break

                        # Check if user has enough credits to continue
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

                        # Stream the response with accurate token tracking using queue for real-time
                        model_name = agent.model.value if hasattr(agent.model, 'value') else agent.model
                        stream_success = False
                        streaming_result = None

                        # Queue for real-time token streaming
                        token_queue: asyncio.Queue = asyncio.Queue()
                        DONE_SENTINEL = object()

                        async def run_streaming_with_usage():
                            """Run the streaming call and put tokens in queue."""
                            def on_token(token: str):
                                token_queue.put_nowait(token)

                            result = await provider.generate_stream_with_usage(
                                system_prompt=system_prompt,
                                user_prompt=user_prompt,
                                model=model_name,
                                temperature=0.7,
                                on_token=on_token,
                            )
                            token_queue.put_nowait(DONE_SENTINEL)
                            return result

                        try:
                            # Start streaming task
                            streaming_task = asyncio.create_task(run_streaming_with_usage())

                            # Yield tokens as they arrive
                            while True:
                                token = await token_queue.get()
                                if token is DONE_SENTINEL:
                                    break
                                yield self._create_event(StreamEventType.AGENT_TOKEN, {
                                    "agent_id": agent.agent_id,
                                    "token": token,
                                })

                            # Get the result with accurate usage
                            streaming_result = await streaming_task
                            stream_success = True
                            # Record successful API call for health tracking
                            health_tracker.record_success(agent.provider)

                        except Exception as e:
                            error_str = str(e).lower()
                            is_overload = 'overload' in error_str or 'rate' in error_str or '529' in error_str or '429' in error_str

                            # Record failed API call for health tracking
                            health_tracker.record_failure(
                                agent.provider,
                                str(e),
                                is_overload=is_overload
                            )

                            if is_overload:
                                # Build context-aware suggestion based on which provider failed
                                if agent.provider == ProviderType.ANTHROPIC:
                                    alt_suggestion = "GPT-4o or Gemini"
                                elif agent.provider == ProviderType.OPENAI:
                                    alt_suggestion = "Claude or Gemini"
                                else:  # Google
                                    alt_suggestion = "Claude or GPT-4o"

                                # Send user-friendly error for overload
                                logger.error(f"Error streaming from {agent.display_name} (overloaded after retries): {e}")
                                yield self._create_event(StreamEventType.ERROR, {
                                    "agent_id": agent.agent_id,
                                    "message": f"The AI service is currently overloaded. Please wait a moment and try again, or switch to a different model (e.g., {alt_suggestion}).",
                                    "error_type": "overload",
                                })
                            else:
                                logger.error(f"Error streaming from {agent.display_name}: {e}")
                                yield self._create_event(StreamEventType.ERROR, {
                                    "agent_id": agent.agent_id,
                                    "message": str(e),
                                })
                            continue

                        if not stream_success:
                            continue

                        # Parse evaluation using content from streaming result
                        full_response = streaming_result.content
                        expected_criteria = [c.name for c in agent.evaluation_criteria]
                        evaluation, parse_error = parse_evaluation(full_response, expected_criteria)

                        # Extract output - preserve content before JSON block
                        output = extract_content_from_response(full_response)

                        # Update working document (only Writers update it)
                        updated_document = self._update_working_document(agent, output)

                        # Calculate credits with actual token counts from API
                        usage = self._calculate_turn_credits(
                            model=model_name,
                            input_tokens=streaming_result.input_tokens,
                            output_tokens=streaming_result.output_tokens,
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
                            # Special final pass prompt - uses current round's Synthesizer directive
                            user_prompt = self._build_agent_prompt(writer, is_first_turn=False, is_final_pass=True)

                            model_name = writer.model.value if hasattr(writer.model, 'value') else writer.model

                            # Queue for real-time token streaming
                            final_token_queue: asyncio.Queue = asyncio.Queue()
                            FINAL_DONE_SENTINEL = object()

                            async def run_final_streaming():
                                """Run the final streaming call and put tokens in queue."""
                                def on_token(token: str):
                                    final_token_queue.put_nowait(token)

                                result = await provider.generate_stream_with_usage(
                                    system_prompt=system_prompt,
                                    user_prompt=user_prompt,
                                    model=model_name,
                                    temperature=0.7,
                                    on_token=on_token,
                                )
                                final_token_queue.put_nowait(FINAL_DONE_SENTINEL)
                                return result

                            try:
                                # Start streaming task
                                final_streaming_task = asyncio.create_task(run_final_streaming())

                                # Yield tokens as they arrive
                                while True:
                                    token = await final_token_queue.get()
                                    if token is FINAL_DONE_SENTINEL:
                                        break
                                    yield self._create_event(StreamEventType.AGENT_TOKEN, {
                                        "agent_id": writer.agent_id,
                                        "token": token,
                                    })

                                # Get the result with accurate usage
                                final_streaming_result = await final_streaming_task
                                full_response = final_streaming_result.content

                                # Parse and record
                                expected_criteria = [c.name for c in writer.evaluation_criteria]
                                evaluation, parse_error = parse_evaluation(full_response, expected_criteria)

                                # Extract output - preserve content before JSON block
                                output = extract_content_from_response(full_response)

                                updated_document = self._update_working_document(writer, output)

                                # Calculate credits with actual token counts
                                usage = self._calculate_turn_credits(
                                    model=model_name,
                                    input_tokens=final_streaming_result.input_tokens,
                                    output_tokens=final_streaming_result.output_tokens,
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
