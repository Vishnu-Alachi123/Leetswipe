"""Tests for duplicate detection.

The stakes are asymmetric: missing a duplicate ships a repeat, but a false
positive silently deletes a good question. Several tests below exist purely to
pin down cases that must *not* match.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deduplication import (  # noqa: E402
    deduplicate,
    find_duplicates,
    question_hash,
    similarity_score,
)

DECK = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "LeetSwipe", "assets", "data", "questions.json",
)


def q(qid, question, options, answer=0, slug="two-sum", explanation="because"):
    return {
        "questionId": qid, "sourceSlug": slug, "question": question,
        "options": options, "answer": answer, "explanation": explanation,
    }


BASE = q("a-1", "Which structure gives O(1) average lookups?",
         ["A hash set", "A sorted list", "A heap", "A queue"])


# ------------------------------------------------------------------ hashing
def test_hash_is_stable():
    assert question_hash(BASE) == question_hash(dict(BASE))


def test_hash_ignores_option_order():
    shuffled = q("a-2", BASE["question"], ["A queue", "A heap", "A sorted list", "A hash set"])
    assert question_hash(shuffled) == question_hash(BASE)


def test_hash_ignores_case_and_punctuation():
    restyled = q("a-3", "which structure gives O(1) average lookups", BASE["options"])
    assert question_hash(restyled) == question_hash(BASE)


def test_hash_distinguishes_different_options():
    other = q("a-4", BASE["question"], ["A hash set", "A sorted list", "A heap", "A stack"])
    assert question_hash(other) != question_hash(BASE)


def test_hash_preserves_math_operators():
    """O(m + n) and O(m * n) are different answers and must not collide.

    Regression: an earlier normaliser stripped all punctuation, folding every
    complexity expression together and making dedupe delete valid questions.
    """
    plus = q("c-1", "Cost of merging two sorted lists?", ["O(m + n)", "O(m * n)", "O(m)", "O(n)"])
    times = q("c-2", "Cost of merging two sorted lists?", ["O(m * n)", "O(m + n)", "O(m)", "O(n)"])
    # Same option *set*, so these two genuinely are duplicates of each other...
    assert question_hash(plus) == question_hash(times)
    # ...but an option set that differs only by the operator must not collide.
    a = q("c-3", "Cost?", ["O(m + n)", "O(x)", "O(y)", "O(z)"])
    b = q("c-4", "Cost?", ["O(m * n)", "O(x)", "O(y)", "O(z)"])
    assert question_hash(a) != question_hash(b)


# --------------------------------------------------------------- similarity
def test_similarity_identical():
    assert similarity_score(BASE, dict(BASE)) == 1.0


def test_similarity_unrelated_is_zero():
    other = q("b-1", "How many nodes does a balanced tree hold?",
              ["2^h", "h", "h^2", "log h"])
    assert similarity_score(BASE, other) == 0.0


def test_similarity_reworded_is_high():
    reworded = q("a-9", "Which structure gives O(1) average lookup time?", BASE["options"])
    assert similarity_score(BASE, reworded) > 0.9


# ---------------------------------------------------------------- dedupe
def test_exact_duplicate_dropped():
    kept, report = deduplicate([BASE, q("a-2", BASE["question"], BASE["options"])])
    assert len(kept) == 1
    assert report.exact_duplicates == 1


def test_duplicate_of_existing_dropped():
    kept, report = deduplicate([q("a-2", BASE["question"], BASE["options"])], [BASE])
    assert kept == []
    assert report.exact_duplicates == 1


def test_distinct_questions_all_kept():
    others = [
        q("a-2", "What is the worst-case cost of chaining in a hash table?",
          ["O(n)", "O(1)", "O(log n)", "O(n^2)"]),
        q("a-3", "Why does a naive pair scan time out on large input?",
          ["Quadratic growth", "Wrong results", "No recursion", "Too little memory"]),
    ]
    kept, report = deduplicate([BASE, *others])
    assert len(kept) == 3
    assert report.removed == 0


def test_near_duplicate_dropped():
    reworded = q("a-2", "Which structure gives O(1) average lookup time?", BASE["options"])
    kept, report = deduplicate([BASE, reworded])
    assert len(kept) == 1
    assert report.near_duplicates == 1


def test_id_collision_dropped():
    """Same id, different content: the id is unusable, so the row must not
    silently shadow the existing one on upsert."""
    clash = q("a-1", "A completely different question about heaps and ordering?",
              ["Alpha", "Beta", "Gamma", "Delta"])
    kept, report = deduplicate([clash], [BASE])
    assert kept == []
    assert report.id_collisions == 1


def test_scope_problem_keeps_same_stem_across_problems():
    """Two problems may legitimately ask the same generic question — they are
    shown in different decks and teach different material."""
    a = q("x-1", "What is the time complexity of the optimal approach?",
          ["O(n)", "O(n^2)", "O(log n)", "O(1)"], slug="two-sum")
    b = q("y-1", "What is the time complexity of the optimal approach?",
          ["O(n)", "O(n^2)", "O(log n)", "O(1)"], slug="valid-anagram")
    kept, report = deduplicate([a, b], scope="problem")
    assert len(kept) == 2
    assert report.cross_problem_matches == 1


def test_scope_global_drops_same_stem_across_problems():
    a = q("x-1", "What is the time complexity of the optimal approach?",
          ["O(n)", "O(n^2)", "O(log n)", "O(1)"], slug="two-sum")
    b = q("y-1", "What is the time complexity of the optimal approach?",
          ["O(n)", "O(n^2)", "O(log n)", "O(1)"], slug="valid-anagram")
    kept, _ = deduplicate([a, b], scope="global")
    assert len(kept) == 1


def test_input_order_is_preserved():
    a, b, c = BASE, q("a-2", "Second distinct question about heaps?", ["1", "2", "3", "4"]), \
        q("a-3", "Third distinct question about graphs?", ["w", "x", "y", "z"])
    kept, _ = deduplicate([a, b, c])
    assert [k["questionId"] for k in kept] == ["a-1", "a-2", "a-3"]


def test_accepts_pydantic_models():
    from schema import MCQ

    model = MCQ(leetQuestionId=1, questionId="m-1", title="t", topics=["Array"],
                sourceSlug="two-sum", difficulty="Easy", question=BASE["question"],
                options=BASE["options"], answer=0, explanation="e")
    kept, report = deduplicate([model], [BASE])
    # Same content as BASE, so it must be caught even though the types differ.
    assert kept == []
    assert report.exact_duplicates == 1


def test_kept_items_are_the_original_objects():
    from schema import MCQ

    model = MCQ(leetQuestionId=1, questionId="m-1", title="t", topics=["Array"],
                difficulty="Easy", question="A unique question about tries?",
                options=["a", "b", "c", "d"], answer=0, explanation="e")
    kept, _ = deduplicate([model])
    assert kept[0] is model


def test_invalid_scope_rejected():
    with pytest.raises(ValueError):
        deduplicate([BASE], scope="everything")


# ------------------------------------------------------- the shipped deck
@pytest.mark.skipif(not os.path.exists(DECK), reason="bundled deck not present")
def test_shipped_deck_has_no_duplicates():
    with open(DECK, encoding="utf-8") as f:
        questions = json.load(f)["questions"]
    assert find_duplicates(questions) == [], "the bundled deck contains duplicates"


@pytest.mark.skipif(not os.path.exists(DECK), reason="bundled deck not present")
def test_shipped_deck_ids_are_unique():
    with open(DECK, encoding="utf-8") as f:
        questions = json.load(f)["questions"]
    ids = [q["questionId"] for q in questions]
    assert len(ids) == len(set(ids))
