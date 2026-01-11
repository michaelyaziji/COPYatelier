"""Simple demo showing Atelier working with clear output."""

import asyncio
import uuid
from app.models.agent import AgentConfig, ProviderType, ModelType, EvaluationCriterion
from app.models.session import SessionConfig, SessionState, OrchestrationFlow, TerminationCondition
from app.core.orchestrator import Orchestrator


async def main():
    print("="*80)
    print("ATELIER DEMO: Three AI Agents Collaborating on Writing")
    print("="*80)
    print()
    print("Task: Write a short paragraph about why learning is important")
    print("Agent 1: Writer (creates initial draft)")
    print("Agent 2: Fact Checker (verifies claims and accuracy)")
    print("Agent 3: Editor (polishes and improves)")
    print()
    print("="*80)
    input("Press Enter to start...")
    print()

    # Configure agents
    writer = AgentConfig(
        agent_id="writer-1",
        display_name="Writer",
        provider=ProviderType.ANTHROPIC,
        model=ModelType.CLAUDE_SONNET_4,  # Using Sonnet
        role_description=(
            "You are a writer. Create clear, engaging prose. "
            "Your output should be ONLY the text you write, nothing else."
        ),
        evaluation_criteria=[
            EvaluationCriterion(
                name="Clarity",
                description="How clear and understandable is the writing",
                weight=1.0
            ),
        ],
    )

    fact_checker = AgentConfig(
        agent_id="factchecker-1",
        display_name="Fact Checker",
        provider=ProviderType.ANTHROPIC,
        model=ModelType.CLAUDE_SONNET_4,
        role_description=(
            "You are a fact checker. Review the text for accuracy. "
            "If any claims seem questionable or need verification, note them. "
            "Then rewrite the text with any necessary corrections or clarifications. "
            "Your output should be the corrected text followed by a brief note about what you checked."
        ),
        evaluation_criteria=[
            EvaluationCriterion(
                name="Accuracy",
                description="How factually accurate is the content",
                weight=1.0
            ),
        ],
    )

    editor = AgentConfig(
        agent_id="editor-1",
        display_name="Editor",
        provider=ProviderType.ANTHROPIC,
        model=ModelType.CLAUDE_SONNET_4,
        role_description=(
            "You are an editor. Read the text and polish it for style and flow. "
            "Make it more engaging and readable while preserving the meaning. "
            "Your output should be ONLY the final polished text, nothing else."
        ),
        evaluation_criteria=[
            EvaluationCriterion(
                name="Quality",
                description="Overall quality and readability of the writing",
                weight=1.0
            ),
        ],
    )

    # Create session
    config = SessionConfig(
        session_id=str(uuid.uuid4()),
        title="Learning Demo",
        agents=[writer, fact_checker, editor],
        flow_type=OrchestrationFlow.SEQUENTIAL,
        termination=TerminationCondition(
            max_rounds=1,  # Just 1 round = 2 turns total
            score_threshold=None
        ),
        initial_prompt=(
            "Write a 100-word paragraph explaining why continuous learning "
            "is important for personal and professional growth."
        ),
        working_document="",
    )

    state = SessionState(config=config)
    orchestrator = Orchestrator(state)

    # Run orchestration
    print("🤖 Agents are working (Writer → Fact Checker → Editor)...")
    await orchestrator.run()

    # Show results
    print("\n" + "="*80)
    print("RESULTS")
    print("="*80)

    writer_turn = state.exchange_history[0]
    factcheck_turn = state.exchange_history[1]
    editor_turn = state.exchange_history[2]

    print("\n📝 TURN 1 - Writer's Draft:")
    print("-" * 80)
    print(writer_turn.working_document)
    if writer_turn.evaluation:
        print(f"\nWriter's Self-Score (Clarity): {writer_turn.evaluation.overall_score:.1f}/10")

    print("\n🔍 TURN 2 - Fact Checker's Review:")
    print("-" * 80)
    print(factcheck_turn.working_document)
    if factcheck_turn.evaluation:
        print(f"\nFact Checker's Self-Score (Accuracy): {factcheck_turn.evaluation.overall_score:.1f}/10")

    print("\n✏️  TURN 3 - Editor's Final Polish:")
    print("-" * 80)
    print(editor_turn.working_document)
    if editor_turn.evaluation:
        print(f"\nEditor's Self-Score (Quality): {editor_turn.evaluation.overall_score:.1f}/10")

    print("\n" + "="*80)
    print("✅ DEMO COMPLETE")
    print("="*80)
    print("\nWhat happened:")
    print("1. The Writer created an initial draft")
    print("2. The Fact Checker reviewed for accuracy and made corrections")
    print("3. The Editor polished the final version for readability")
    print("4. Each agent evaluated their own work with scores")
    print("\nThis is how Atelier enables AI agents to collaborate!")
    print()


if __name__ == "__main__":
    asyncio.run(main())
