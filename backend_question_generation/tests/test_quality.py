"""Tests for the quality gate.

Each check gets a positive case (it fires when it should) and a negative case
(it stays quiet on good material), because a gate that rejects good questions is
worse than no gate at all.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quality import (  # noqa: E402
    check_question,
    check_set,
    filter_questions,
    parse_review,
    build_review_prompt,
)

DECK = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "LeetSwipe", "assets", "data", "questions.json",
)

GOOD_EXPLANATION = (
    "A hash set answers membership in constant time on average, so a single pass "
    "over the input suffices. The sorted array is the tempting runner-up because "
    "its lookups are logarithmic, but keeping it ordered costs linear time per "
    "insertion, which is strictly worse overall."
)


def mcq(**overrides):
    base = {
        "question": "You must repeatedly test whether a value was already encountered while touching each element once. Which structure fits?",
        "options": ["A hash set", "A sorted array searched by bisection",
                    "A min-heap ordered by value", "A doubly linked list of entries"],
        "answer": 0,
        "explanation": GOOD_EXPLANATION,
    }
    base.update(overrides)
    return base


# ------------------------------------------------------------------ baseline
def test_good_question_scores_full_marks():
    result = check_question(mcq())
    assert result.flags == []
    assert result.score == 5
    assert result.passed


# ------------------------------------------------------------ answer leakage
def test_answer_leakage_flagged():
    """Wording unique to the correct option echoed in the stem."""
    result = check_question(mcq(
        question="Which structure provides constant-time membership through hashing buckets?",
        options=["Hashing buckets structure", "A sorted array", "A min-heap", "A linked list"],
    ))
    assert "answer-leakage" in result.flags


def test_shared_wording_with_distractors_is_not_leakage():
    """A word in the stem that also appears in a distractor proves nothing."""
    result = check_question(mcq(
        question="Which traversal visits every node of the tree exactly once?",
        options=["A depth-first traversal", "A breadth-limited traversal",
                 "A randomised traversal", "A partial traversal"],
        explanation=GOOD_EXPLANATION,
    ))
    assert "answer-leakage" not in result.flags


# --------------------------------------------------------- duplicate options
def test_duplicate_options_flagged():
    result = check_question(mcq(options=["A hash set", "A hash set!", "A heap", "A queue"]))
    assert "duplicate-options" in result.flags


def test_operator_differences_are_not_duplicates():
    """Regression: O(m + n) and O(m * n) are different answers.

    Stripping operators during normalisation once made these look identical and
    docked a perfectly good question three points.
    """
    result = check_question(mcq(
        question="What is the cost of merging two sorted linked lists of lengths m and n?",
        options=["O(m + n)", "O(m * n)", "O(m)", "O(n)"],
    ))
    assert "duplicate-options" not in result.flags


# ---------------------------------------------------------- option length tell
def test_length_tell_flagged():
    result = check_question(mcq(
        options=["O(n)", "O(n^2)", "O(log n)",
                 "O(n * k) where n is the number of strings and k is the maximum length of any string"],
        answer=3,
    ))
    assert "option-length-tell" in result.flags


def test_balanced_options_have_no_length_tell():
    assert "option-length-tell" not in check_question(mcq()).flags


def test_short_uniform_options_are_not_a_tell():
    """Four terse options where the correct one happens to be a character longer
    must not trip the check."""
    result = check_question(mcq(options=["O(n)", "O(1)", "O(n^2)", "O(log n)"], answer=3))
    assert "option-length-tell" not in result.flags


# ------------------------------------------------------------ option prefixes
@pytest.mark.parametrize("prefixed", ["A) A hash set", "a. A hash set", "(A) A hash set", "1) A hash set"])
def test_option_prefixes_flagged(prefixed):
    opts = mcq()["options"][:]
    opts[0] = prefixed
    assert "option-prefixes" in check_question(mcq(options=opts)).flags


# --------------------------------------------------------------- explanations
def test_short_explanation_flagged():
    result = check_question(mcq(explanation="A hash set is faster."))
    assert "explanation-too-short" in result.flags
    assert result.explanation_score < 5


def test_explanation_without_contrast_flagged():
    result = check_question(mcq(explanation=(
        "A hash set answers membership in constant time on average, so one pass "
        "over the input is enough to solve the whole problem efficiently here."
    )))
    assert "explanation-asserts-only" in result.flags


def test_teaching_explanation_passes():
    assert check_question(mcq()).explanation_score == 5


# ------------------------------------------------------------------ stem
def test_short_stem_flagged():
    assert "stem-too-short" in check_question(mcq(question="Which one?")).flags


# ----------------------------------------------------------------- scoring
def test_score_floor_is_one():
    result = check_question({
        "question": "Hash?", "options": ["hash", "hash", "hash", "hash"],
        "answer": 0, "explanation": "",
    })
    assert result.score == 1


def test_score_never_exceeds_five():
    assert check_question(mcq()).score == 5


def test_malformed_question_does_not_raise():
    assert check_question({}).score >= 1


# ------------------------------------------------------------- set-level
def test_answer_position_bias_flagged():
    questions = [mcq(answer=0) for _ in range(10)]
    assert any("answer-position-bias" in f for f in check_set(questions))


def test_varied_answer_positions_pass():
    questions = [mcq(answer=i % 4) for i in range(12)]
    assert check_set(questions) == []


def test_bias_check_needs_a_sample():
    """Three questions landing on the same index is chance, not bias."""
    assert check_set([mcq(answer=0) for _ in range(3)]) == []


# ------------------------------------------------------------------ filter
def test_filter_drops_below_threshold():
    bad = {"question": "Hash?", "options": ["a", "a", "a", "a"], "answer": 0, "explanation": ""}
    kept, report = filter_questions([mcq(), bad])
    assert len(kept) == 1
    assert report.accepted == 1 and report.rejected == 1


def test_filter_min_score_one_keeps_everything():
    bad = {"question": "Hash?", "options": ["a", "a", "a", "a"], "answer": 0, "explanation": ""}
    kept, _ = filter_questions([mcq(), bad], min_score=1)
    assert len(kept) == 2


def test_filter_pairs_each_question_with_its_result():
    kept, _ = filter_questions([mcq()])
    question, result = kept[0]
    assert question["answer"] == 0 and result.score == 5


# ------------------------------------------------------------- llm review
def test_parse_review_reads_verdicts():
    parsed = parse_review("1|accept|5|solid\n2|reject|2|answer is wrong", 2)
    assert parsed[0][0] is True and parsed[0][1] == 5
    assert parsed[1][0] is False and parsed[1][1] == 2


def test_parse_review_pads_missing_lines_as_accept():
    """A truncated review must not silently delete the questions it omitted."""
    parsed = parse_review("1|accept|5|fine", 3)
    assert len(parsed) == 3
    assert all(accepted for accepted, _, _ in parsed)


def test_parse_review_ignores_preamble():
    parsed = parse_review("Here are my reviews:\n1|reject|1|leaks the answer", 1)
    assert parsed[0][0] is False


def test_review_prompt_marks_the_answer():
    prompt = build_review_prompt([mcq()])
    assert "<-- marked correct" in prompt


# ------------------------------------------------------- the shipped deck
@pytest.mark.skipif(not os.path.exists(DECK), reason="bundled deck not present")
def test_shipped_deck_is_mostly_clean():
    """A guardrail, not a gate: if a future run drives the pass rate below 90%
    something has gone wrong with generation, not with this test."""
    with open(DECK, encoding="utf-8") as f:
        questions = json.load(f)["questions"]
    _, report = filter_questions(questions)
    assert report.accepted / report.total > 0.90, report.summary()
