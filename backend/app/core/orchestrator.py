"""Core orchestration engine for multi-agent writing collaboration."""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from ..models.agent import AgentConfig, ProviderType
from ..models.session import SessionState, OrchestrationFlow
from ..models.exchange import ExchangeTurn, Evaluation
from ..providers import AIProvider, AnthropicProvider, GoogleProvider, OpenAIProvider
from .config import get_settings
from .evaluation import parse_evaluation

logger = logging.getLogger(__name__)


class Orchestrator:
    """
    Core orchestration engine that manages multi-agent writing workflows.

    Responsibilities:
    - Initialize AI providers based on agent configs
    - Execute sequential or parallel agent exchanges
    - Build context prompts with history and documents
    - Parse and validate agent evaluations
    - Check termination conditions
    - Maintain session state
    """

    def __init__(self, session_state: SessionState):
        """
        Initialize orchestrator with session state.

        Args:
            session_state: Complete session configuration and runtime state
        """
        self.state = session_state
        self.settings = get_settings()
        self.providers = self._initialize_providers()

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

    def _build_agent_prompt(
        self,
        agent: AgentConfig,
        is_first_turn: bool
    ) -> str:
        """
        Build the complete prompt for an agent, including context and instructions.

        Args:
            agent: Agent configuration
            is_first_turn: Whether this is the first turn in the orchestration

        Returns:
            Complete user prompt string
        """
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

        # 2. Task instructions (role-specific)
        prompt_parts.append("\n=== YOUR TASK ===\n")
        prompt_parts.append(self._get_task_instructions(agent, is_first_turn, self.state.current_round))

        # 3. Evaluation instructions
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
        """
        Build the system prompt for an agent.

        Args:
            agent: Agent configuration

        Returns:
            System prompt string
        """
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

        Args:
            agent: The agent configuration
            agent_output: The agent's output text

        Returns:
            Updated working document (or current document if agent is not a Writer)
        """
        if agent.phase == 1:  # Writer
            return agent_output
        else:
            # Editors and Synthesizer don't change the document
            return self._get_current_document()

    def _aggregate_editor_feedback(self, round_number: int) -> str:
        """
        Aggregate feedback from all editors in a given round.

        Args:
            round_number: The round to collect feedback from

        Returns:
            Formatted string with all editor feedback
        """
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
        """
        Get task instructions based on agent role/phase.

        Args:
            agent: Agent configuration
            is_first_turn: Whether this is the first turn overall
            round_number: Current round number

        Returns:
            Task-specific instructions for this agent
        """
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
        """
        Build revision instructions for the Writer with aggregated feedback.

        Args:
            round_number: Current round number

        Returns:
            Revision instructions with feedback summary
        """
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
        """
        Get instructions for editor roles.

        Args:
            agent: Agent configuration

        Returns:
            Editor-specific instructions
        """
        base = "Review the WORKING DOCUMENT above and provide your editorial feedback.\n\n"

        role_instructions = {
            "content_expert": "Focus on: accuracy, completeness, intellectual depth. Flag oversimplifications, gaps, and claims that overreach evidence. Suggest specific additions.\n\nDo NOT rewrite the document. Provide feedback only.",
            "style_editor": "Focus on: sentence rhythm, word choice, transitions, clarity, economy. Cut throat-clearing, redundancy, jargon. Preserve the author's voice.\n\nDo NOT rewrite the document. Provide feedback only.",
            "fact_checker": "Focus on: verifiable claims, statistics, attributions. For each issue, specify what's claimed, why it's problematic, and what would resolve it.\n\nDo NOT rewrite the document. Provide feedback only.",
        }

        return base + role_instructions.get(agent.agent_id, "Provide editorial feedback. Do NOT rewrite the document.")

    def _get_synthesizer_instructions(self) -> str:
        """
        Get instructions for the Synthesizing Editor.

        Returns:
            Synthesizer-specific instructions
        """
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

        Returns:
            Dictionary mapping phase number to list of agents in that phase
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

    async def _execute_agent_turn(
        self,
        agent: AgentConfig,
        turn_number: int,
        round_number: int
    ) -> ExchangeTurn:
        """
        Execute a single agent turn.

        Args:
            agent: Agent configuration
            turn_number: Sequential turn number
            round_number: Current round number

        Returns:
            ExchangeTurn with the agent's output and evaluation
        """
        logger.info(f"Executing turn {turn_number} for agent {agent.display_name}")

        # Get the appropriate provider
        provider = self.providers.get(agent.provider)
        if not provider:
            raise ValueError(f"Provider {agent.provider} not configured or API key missing")

        # Build prompts
        is_first_turn = turn_number == 1
        system_prompt = self._build_system_prompt(agent)
        user_prompt = self._build_agent_prompt(agent, is_first_turn)

        # Generate response
        try:
            # Handle both enum and string model types
            model_name = agent.model.value if hasattr(agent.model, 'value') else agent.model

            response = await provider.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model_name,
                temperature=0.7,
            )

            raw_response = response.content

        except Exception as e:
            logger.error(f"Error generating response from {agent.display_name}: {e}")
            raise

        # Parse evaluation
        expected_criteria = [c.name for c in agent.evaluation_criteria]
        evaluation, parse_error = parse_evaluation(raw_response, expected_criteria)

        # Extract output (if JSON was used, the output is in the JSON; otherwise use full response)
        if evaluation and '```json' in raw_response:
            # Output was in JSON, extract it
            try:
                json_match = raw_response.find('{')
                if json_match != -1:
                    data = json.loads(raw_response[json_match:raw_response.rfind('}')+1])
                    output = data.get("output", raw_response)
                else:
                    output = raw_response
            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
                logger.warning(f"Failed to parse JSON output: {e}")
                output = raw_response
        else:
            # Use the full response as output
            output = raw_response

        # Update working document (only Writers update it)
        updated_document = self._update_working_document(agent, output)

        # Create exchange turn
        turn = ExchangeTurn(
            turn_number=turn_number,
            round_number=round_number,
            agent_id=agent.agent_id,
            agent_name=agent.display_name,
            timestamp=datetime.now(timezone.utc),
            output=output,
            raw_response=raw_response,
            evaluation=evaluation,
            parse_error=parse_error,
            working_document=updated_document,
        )

        return turn

    def _check_termination(self) -> Optional[str]:
        """
        Check if termination conditions are met.

        Returns:
            Termination reason if conditions met, None otherwise
        """
        # Check max rounds
        if self.state.current_round >= self.state.config.termination.max_rounds:
            return f"Maximum rounds reached ({self.state.config.termination.max_rounds})"

        # Check score threshold
        if self.state.config.termination.score_threshold:
            threshold = self.state.config.termination.score_threshold

            # Check if any recent evaluation meets threshold
            if self.state.exchange_history:
                last_turn = self.state.exchange_history[-1]
                if last_turn.evaluation and last_turn.evaluation.overall_score >= threshold:
                    return (
                        f"Score threshold reached: {last_turn.agent_name} scored "
                        f"{last_turn.evaluation.overall_score:.1f} (threshold: {threshold})"
                    )

        return None

    async def run_sequential(self) -> None:
        """
        Run sequential orchestration with phase-based execution.

        Executes agents in phase order: Phase 1 (Writer) → Phase 2 (Editors) → Phase 3 (Synthesizer)
        Continues until termination conditions are met or cancelled by user.
        """
        logger.info("Starting sequential orchestration")

        self.state.is_running = True
        self.state.is_cancelled = False
        self.state.current_round = 0

        # Group agents by phase for proper execution order
        phases = self._get_agents_by_phase()
        active_agents = phases[1] + phases[2] + phases[3]

        if not active_agents:
            raise ValueError("No active agents configured")

        logger.info(f"Phase 1 (Writer): {[a.display_name for a in phases[1]]}")
        logger.info(f"Phase 2 (Editors): {[a.display_name for a in phases[2]]}")
        logger.info(f"Phase 3 (Synthesizer): {[a.display_name for a in phases[3]]}")

        turn_number = 0

        try:
            while True:
                # Check for cancellation before starting a new round
                if self.state.is_cancelled:
                    self.state.termination_reason = "Stopped by user"
                    logger.info("Orchestration cancelled by user")
                    break

                self.state.current_round += 1
                logger.info(f"Starting round {self.state.current_round}")

                # Execute agents in phase order: Phase 1 → Phase 2 → Phase 3
                for phase_num in [1, 2, 3]:
                    for agent in phases[phase_num]:
                        # Check for cancellation before each agent turn
                        if self.state.is_cancelled:
                            self.state.termination_reason = "Stopped by user"
                            logger.info("Orchestration cancelled by user")
                            break

                        turn_number += 1
                        logger.info(f"Executing phase {phase_num} agent: {agent.display_name}")

                        # Execute agent turn
                        turn = await self._execute_agent_turn(
                            agent=agent,
                            turn_number=turn_number,
                            round_number=self.state.current_round
                        )

                        # Add to history
                        self.state.exchange_history.append(turn)

                        logger.info(
                            f"Turn {turn_number} completed. "
                            f"Score: {turn.evaluation.overall_score if turn.evaluation else 'N/A'}"
                        )

                    # Check if we need to break out of the phase loop due to cancellation
                    if self.state.is_cancelled:
                        break

                # Exit if cancelled during the round
                if self.state.is_cancelled:
                    break

                # Check termination after each round
                termination_reason = self._check_termination()
                if termination_reason:
                    self.state.termination_reason = termination_reason
                    logger.info(f"Orchestration terminated: {termination_reason}")
                    break

        finally:
            self.state.is_running = False

    async def run(self) -> None:
        """
        Run orchestration based on configured flow type.

        Dispatches to the appropriate orchestration method.
        """
        if self.state.config.flow_type == OrchestrationFlow.SEQUENTIAL:
            await self.run_sequential()
        elif self.state.config.flow_type == OrchestrationFlow.PARALLEL_CRITIQUE:
            # Placeholder for Phase 6
            raise NotImplementedError("Parallel critique mode not yet implemented")
        else:
            raise ValueError(f"Unknown flow type: {self.state.config.flow_type}")
