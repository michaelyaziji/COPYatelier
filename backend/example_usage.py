"""
Example usage script for Phase 1 - Core Orchestration Engine

This script demonstrates:
1. Creating a session with 2 agents
2. Configuring sequential orchestration
3. Running the orchestration
4. Viewing results

Before running:
1. Install dependencies: pip install -r requirements.txt
2. Create .env file with at least one API key (see .env.example)
3. Run: python example_usage.py
"""

import asyncio
import uuid
from app.models.agent import AgentConfig, ProviderType, ModelType, EvaluationCriterion
from app.models.session import SessionConfig, SessionState, OrchestrationFlow, TerminationCondition
from app.core.orchestrator import Orchestrator


async def main():
    """Run example orchestration."""

    print("=" * 80)
    print("Atelier Phase 1 Example: Two-Agent Sequential Writing")
    print("=" * 80)

    # Configuration: Academic writing scenario
    # Agent 1: Initial Writer
    writer = AgentConfig(
        agent_id="writer-1",
        display_name="Academic Writer",
        provider=ProviderType.ANTHROPIC,
        model=ModelType.CLAUDE_SONNET_4,
        role_description=(
            "You are an academic writer specializing in clear, rigorous argumentation. "
            "Your goal is to produce well-structured, evidence-based writing that is "
            "accessible to educated non-specialists."
        ),
        evaluation_criteria=[
            EvaluationCriterion(
                name="Argumentation Clarity",
                description="How clearly and logically the argument is presented",
                weight=1.0
            ),
            EvaluationCriterion(
                name="Evidence Quality",
                description="Strength and relevance of supporting evidence",
                weight=1.0
            ),
            EvaluationCriterion(
                name="Scholarly Tone",
                description="Appropriate academic register and professionalism",
                weight=0.8
            ),
        ],
        is_active=True,
    )

    # Agent 2: Critical Editor
    editor = AgentConfig(
        agent_id="editor-1",
        display_name="Critical Editor",
        provider=ProviderType.ANTHROPIC,
        model=ModelType.CLAUDE_SONNET_4,
        role_description=(
            "You are a critical editor with expertise in academic writing. "
            "Review drafts for logical coherence, evidence gaps, and clarity issues. "
            "Provide constructive critique and suggest specific improvements. "
            "Then produce a revised version addressing your own critiques."
        ),
        evaluation_criteria=[
            EvaluationCriterion(
                name="Logical Coherence",
                description="Internal consistency and logical flow of arguments",
                weight=1.0
            ),
            EvaluationCriterion(
                name="Critical Rigor",
                description="Depth of critical analysis and counterargument consideration",
                weight=1.0
            ),
            EvaluationCriterion(
                name="Clarity of Expression",
                description="Precision and accessibility of language",
                weight=0.9
            ),
        ],
        is_active=True,
    )

    # Session configuration
    session_config = SessionConfig(
        session_id=str(uuid.uuid4()),
        title="Example: Academic Argument Refinement",
        agents=[writer, editor],
        flow_type=OrchestrationFlow.SEQUENTIAL,
        termination=TerminationCondition(
            max_rounds=3,  # 3 rounds = 6 total turns (Writer → Editor → Writer → Editor → Writer → Editor)
            score_threshold=8.5,  # Stop early if any agent scores ≥ 8.5
        ),
        initial_prompt=(
            "Write a 300-word argument defending the position that "
            "\"artificial intelligence will fundamentally transform academic research "
            "within the next decade.\" Include at least two supporting reasons and "
            "acknowledge one potential counterargument."
        ),
        working_document="",  # Start from scratch
        reference_documents={},  # No reference materials for this example
    )

    # Create session state
    session_state = SessionState(config=session_config)

    # Create orchestrator
    print(f"\nSession ID: {session_config.session_id}")
    print(f"Title: {session_config.title}")
    print(f"Agents: {writer.display_name}, {editor.display_name}")
    print(f"Flow: Sequential")
    print(f"Max Rounds: {session_config.termination.max_rounds}")
    print(f"Score Threshold: {session_config.termination.score_threshold}")
    print("\nInitial Prompt:")
    print(f"  {session_config.initial_prompt}")
    print("\n" + "=" * 80)
    print("Starting orchestration...\n")

    orchestrator = Orchestrator(session_state)

    try:
        # Run orchestration
        await orchestrator.run()

        # Display results
        print("\n" + "=" * 80)
        print("ORCHESTRATION COMPLETE")
        print("=" * 80)
        print(f"\nTermination Reason: {session_state.termination_reason}")
        print(f"Rounds Completed: {session_state.current_round}")
        print(f"Total Turns: {len(session_state.exchange_history)}")

        print("\n" + "-" * 80)
        print("EXCHANGE SUMMARY")
        print("-" * 80)

        for turn in session_state.exchange_history:
            print(f"\n[Round {turn.round_number}, Turn {turn.turn_number}] {turn.agent_name}")

            if turn.evaluation:
                print(f"  Overall Score: {turn.evaluation.overall_score:.1f}/10")
                for cs in turn.evaluation.criteria_scores:
                    print(f"    - {cs.criterion}: {cs.score}/10")
            else:
                print(f"  Evaluation: Parse error - {turn.parse_error}")

            # Show first 200 chars of output
            output_preview = turn.output[:200].replace('\n', ' ')
            if len(turn.output) > 200:
                output_preview += "..."
            print(f"  Output: {output_preview}")

        print("\n" + "-" * 80)
        print("FINAL DOCUMENT")
        print("-" * 80)
        print(session_state.exchange_history[-1].working_document)
        print("\n" + "=" * 80)

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
