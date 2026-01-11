"""Tests for core orchestration engine."""

import pytest
from app.core.evaluation import parse_evaluation
from app.models.exchange import Evaluation, CriterionScore


class TestEvaluationParsing:
    """Test evaluation parsing with various response formats."""

    def test_parse_json_evaluation(self):
        """Test parsing structured JSON evaluation."""
        response = '''
Here is my revised draft:

[Draft content here...]

```json
{
  "output": "The revised text goes here",
  "evaluation": {
    "criteria_scores": [
      {"criterion": "Clarity", "score": 8, "justification": "Clear argument structure"},
      {"criterion": "Evidence", "score": 7, "justification": "Good supporting evidence"}
    ],
    "overall_score": 7.5,
    "summary": "Strong draft with minor improvements needed"
  }
}
```
        '''

        evaluation, error = parse_evaluation(response, ["Clarity", "Evidence"])

        assert evaluation is not None
        assert error is None
        assert evaluation.overall_score == 7.5
        assert len(evaluation.criteria_scores) == 2
        assert evaluation.criteria_scores[0].criterion == "Clarity"
        assert evaluation.criteria_scores[0].score == 8

    def test_parse_natural_language_evaluation(self):
        """Test parsing scores from natural language."""
        response = '''
Here's my evaluation:

Clarity: 8/10 - The argument flows well
Evidence: 7/10 - Could use more sources
Style: 9/10 - Engaging prose

Overall score: 8/10

Summary: A strong piece with good argumentation.
        '''

        evaluation, error = parse_evaluation(
            response,
            ["Clarity", "Evidence", "Style"]
        )

        assert evaluation is not None
        assert len(evaluation.criteria_scores) == 3
        assert evaluation.criteria_scores[0].score == 8
        assert evaluation.overall_score == 8

    def test_parse_fallback_extraction(self):
        """Test fallback parsing when no clear structure."""
        response = '''
I would rate this 7 for clarity, 8 for evidence quality,
and 6 for overall style.
        '''

        evaluation, error = parse_evaluation(
            response,
            ["Clarity", "Evidence", "Style"]
        )

        # Should extract numbers in order
        assert evaluation is not None
        assert len(evaluation.criteria_scores) == 3

    def test_parse_failure(self):
        """Test handling of unparseable responses."""
        response = "This text contains no scores at all."

        evaluation, error = parse_evaluation(
            response,
            ["Clarity", "Evidence"]
        )

        assert evaluation is None
        assert error is not None
        assert "Failed to parse evaluation" in error


class TestWeightedScoring:
    """Test weighted score calculation."""

    def test_weighted_average(self):
        """Test weighted score calculation."""
        from app.core.evaluation import calculate_weighted_score

        evaluation = Evaluation(
            criteria_scores=[
                CriterionScore(criterion="Clarity", score=8, justification="Good"),
                CriterionScore(criterion="Evidence", score=6, justification="Needs work"),
            ],
            overall_score=7,
            summary="Test"
        )

        # Equal weights (should be simple average)
        weights = {"Clarity": 1.0, "Evidence": 1.0}
        weighted = calculate_weighted_score(evaluation, weights)
        assert weighted == 7.0

        # Weighted (Clarity 2x more important)
        weights = {"Clarity": 0.67, "Evidence": 0.33}
        weighted = calculate_weighted_score(evaluation, weights)
        assert weighted > 7.0  # Should be closer to 8


@pytest.mark.asyncio
async def test_orchestrator_initialization():
    """Test orchestrator initialization."""
    from app.models.agent import AgentConfig, ProviderType, ModelType, EvaluationCriterion
    from app.models.session import SessionConfig, SessionState, OrchestrationFlow
    from app.core.orchestrator import Orchestrator

    config = SessionConfig(
        session_id="test-session",
        title="Test Session",
        agents=[
            AgentConfig(
                agent_id="agent-1",
                display_name="Test Agent",
                provider=ProviderType.ANTHROPIC,
                model=ModelType.CLAUDE_HAIKU,
                role_description="You are a test agent",
                evaluation_criteria=[
                    EvaluationCriterion(name="Clarity", description="How clear is the text")
                ],
            )
        ],
        flow_type=OrchestrationFlow.SEQUENTIAL,
        initial_prompt="Write a test document",
        working_document="Initial draft",
    )

    state = SessionState(config=config)
    orchestrator = Orchestrator(state)

    assert orchestrator.state == state
    assert orchestrator.settings is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
