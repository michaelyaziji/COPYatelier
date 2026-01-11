"""Evaluation parsing and scoring logic."""

import json
import re
from typing import Optional, Tuple

from ..models.exchange import Evaluation, CriterionScore


def parse_evaluation(
    raw_response: str,
    expected_criteria: list[str]
) -> Tuple[Optional[Evaluation], Optional[str]]:
    """
    Parse structured evaluation from agent response.

    This function attempts to extract evaluation data from the agent's response.
    It tries multiple strategies:
    1. JSON block extraction (looking for ```json or raw JSON objects)
    2. Natural language parsing for scores and justifications
    3. Fallback extraction of any numeric scores

    Args:
        raw_response: The full response text from the AI agent
        expected_criteria: List of criterion names we expect to see

    Returns:
        Tuple of (Evaluation object, error message)
        - If parsing succeeds: (Evaluation, None)
        - If parsing fails: (None, error_message)
    """

    # Strategy 1: Try to find JSON block (```json...``` or direct JSON object)
    evaluation, error = _try_json_extraction(raw_response, expected_criteria)
    if evaluation:
        return evaluation, None

    # Strategy 2: Try natural language parsing
    evaluation, error = _try_natural_language_parsing(raw_response, expected_criteria)
    if evaluation:
        return evaluation, None

    # Strategy 3: Last resort - extract any numbers we can find
    evaluation, error = _try_fallback_extraction(raw_response, expected_criteria)
    if evaluation:
        return evaluation, None

    return None, f"Failed to parse evaluation: {error}"


def _try_json_extraction(
    raw_response: str,
    expected_criteria: list[str]
) -> Tuple[Optional[Evaluation], Optional[str]]:
    """Try to extract evaluation from JSON block."""

    # Look for ```json code blocks
    json_pattern = r'```json\s*(\{.*?\})\s*```'
    matches = re.findall(json_pattern, raw_response, re.DOTALL)

    if matches:
        try:
            data = json.loads(matches[0])
            return _parse_json_structure(data, expected_criteria)
        except json.JSONDecodeError as e:
            return None, f"JSON decode error: {e}"

    # Try to find raw JSON object
    brace_start = raw_response.find('{')
    if brace_start != -1:
        # Find the matching closing brace
        brace_count = 0
        for i, char in enumerate(raw_response[brace_start:], start=brace_start):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    try:
                        data = json.loads(raw_response[brace_start:i+1])
                        return _parse_json_structure(data, expected_criteria)
                    except json.JSONDecodeError:
                        pass
                    break

    return None, "No valid JSON found"


def _parse_json_structure(
    data: dict,
    expected_criteria: list[str]
) -> Tuple[Optional[Evaluation], Optional[str]]:
    """Parse evaluation from JSON structure."""

    try:
        # Handle nested evaluation object
        eval_data = data.get("evaluation", data)

        criteria_scores = []
        criteria_list = eval_data.get("criteria_scores", [])

        for criterion_data in criteria_list:
            criteria_scores.append(
                CriterionScore(
                    criterion=criterion_data["criterion"],
                    score=float(criterion_data["score"]),
                    justification=criterion_data.get("justification", "")
                )
            )

        overall_score = float(eval_data.get("overall_score", 0))
        summary = eval_data.get("summary", "")

        # Calculate overall score if not provided
        if overall_score == 0 and criteria_scores:
            overall_score = sum(cs.score for cs in criteria_scores) / len(criteria_scores)

        evaluation = Evaluation(
            criteria_scores=criteria_scores,
            overall_score=overall_score,
            summary=summary
        )

        return evaluation, None

    except (KeyError, ValueError, TypeError) as e:
        return None, f"JSON structure error: {e}"


def _try_natural_language_parsing(
    raw_response: str,
    expected_criteria: list[str]
) -> Tuple[Optional[Evaluation], Optional[str]]:
    """Try to extract scores from natural language text."""

    criteria_scores = []

    # Look for patterns like "Criterion Name: 7/10" or "Criterion Name: 7"
    for criterion in expected_criteria:
        # Escape special regex characters in criterion name
        escaped_criterion = re.escape(criterion)

        # Pattern: "Criterion: 7/10" or "Criterion: 7"
        pattern = rf'{escaped_criterion}\s*:?\s*(\d+(?:\.\d+)?)\s*(?:/\s*10)?'
        match = re.search(pattern, raw_response, re.IGNORECASE)

        if match:
            score = float(match.group(1))
            # If score is expressed as "7" assume it's out of 10
            if score <= 10:
                # Try to find justification (text after the score, before next criterion or evaluation marker)
                justification = ""
                start_pos = match.end()
                # Look ahead for justification text
                next_section = raw_response[start_pos:start_pos+200]
                if next_section.strip():
                    justification = next_section.split('\n')[0].strip(': -')

                criteria_scores.append(
                    CriterionScore(
                        criterion=criterion,
                        score=score,
                        justification=justification
                    )
                )

    if criteria_scores:
        # Try to find overall score
        overall_pattern = r'overall\s*(?:score)?:?\s*(\d+(?:\.\d+)?)\s*(?:/\s*10)?'
        overall_match = re.search(overall_pattern, raw_response, re.IGNORECASE)

        if overall_match:
            overall_score = float(overall_match.group(1))
        else:
            # Calculate average
            overall_score = sum(cs.score for cs in criteria_scores) / len(criteria_scores)

        # Try to extract summary
        summary_pattern = r'(?:summary|overall assessment):?\s*(.+?)(?:\n\n|\n#|$)'
        summary_match = re.search(summary_pattern, raw_response, re.IGNORECASE | re.DOTALL)
        summary = summary_match.group(1).strip() if summary_match else ""

        evaluation = Evaluation(
            criteria_scores=criteria_scores,
            overall_score=overall_score,
            summary=summary
        )

        return evaluation, None

    return None, "No natural language scores found"


def _try_fallback_extraction(
    raw_response: str,
    expected_criteria: list[str]
) -> Tuple[Optional[Evaluation], Optional[str]]:
    """Last resort: extract any numbers as scores."""

    # Find all numbers that could be scores (1-10)
    numbers = re.findall(r'\b([1-9]|10)(?:\.\d+)?\b', raw_response)

    if numbers:
        # Take up to len(expected_criteria) numbers and assign them
        scores = [float(n) for n in numbers[:len(expected_criteria)]]

        criteria_scores = [
            CriterionScore(
                criterion=criterion,
                score=score,
                justification="(Auto-extracted)"
            )
            for criterion, score in zip(expected_criteria, scores)
        ]

        overall_score = sum(cs.score for cs in criteria_scores) / len(criteria_scores)

        evaluation = Evaluation(
            criteria_scores=criteria_scores,
            overall_score=overall_score,
            summary="(Scores extracted via fallback parsing)"
        )

        return evaluation, None

    return None, "No extractable scores found"


def calculate_weighted_score(evaluation: Evaluation, weights: dict[str, float]) -> float:
    """
    Calculate weighted overall score from criterion scores.

    Args:
        evaluation: Evaluation with criterion scores
        weights: Dict mapping criterion name to weight (0-1)

    Returns:
        Weighted average score
    """
    total_weight = 0.0
    weighted_sum = 0.0

    for cs in evaluation.criteria_scores:
        weight = weights.get(cs.criterion, 1.0)
        weighted_sum += cs.score * weight
        total_weight += weight

    if total_weight == 0:
        return evaluation.overall_score

    return weighted_sum / total_weight
