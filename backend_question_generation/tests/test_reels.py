"""Tests for reel generation and the shipped reel set.

A reel fails in ways the schema cannot see — a line highlight pointing past the
end of the listing, two steps drawing the same picture — and each of those
reaches the learner as a visibly broken animation. These pin down the validator
that catches them, and assert the curated reels are clean.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import seed_reels  # noqa: E402
from generate_reels import CATALOG, generate_mock, validate_reel  # noqa: E402
from schema import AlgorithmReel, ReelStep, Visualization  # noqa: E402

REELS_JSON = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "LeetSwipe", "assets", "data", "reels.json",
)

NARRATION = (
    "We read the next value and add it to the running total, which grows by that "
    "amount. Every element is touched exactly once, so the work grows in step "
    "with the size of the input rather than faster than it."
)


def viz(marker):
    return Visualization(kind="array", state={"cells": [{"value": marker, "status": "active"}]})


def step(n, *, lines=(1,), audio=NARRATION, marker=None, explanation="Does a thing."):
    return ReelStep(
        stepNumber=n, code="total += x", highlightLines=list(lines),
        explanation=explanation, audioScript=audio,
        visualization=viz(marker if marker is not None else n),
    )


def reel(steps, *, code="a = 1\nb = 2\nc = 3"):
    return AlgorithmReel(
        reelId="t", algorithmName="Test", description="d", fullCode=code,
        difficulty="Easy", steps=steps,
    )


# ------------------------------------------------------------------ baseline
def test_well_formed_reel_passes():
    assert validate_reel(reel([step(1), step(2)])) == []


# ------------------------------------------------------------ line highlights
def test_highlight_past_end_of_listing_rejected():
    problems = validate_reel(reel([step(1, lines=[99]), step(2)]))
    assert any("highlights line 99" in p for p in problems)


def test_highlight_of_zero_rejected():
    """Line numbers are 1-based; 0 means the model counted from zero."""
    assert validate_reel(reel([step(1, lines=[0]), step(2)]))


def test_highlight_on_last_line_is_fine():
    assert validate_reel(reel([step(1, lines=[3]), step(2)])) == []


def test_empty_highlights_are_allowed():
    """A closing "why is this fast" step legitimately highlights nothing."""
    assert validate_reel(reel([step(1, lines=[]), step(2)])) == []


# -------------------------------------------------------------- visualisation
def test_identical_consecutive_visualisations_rejected():
    problems = validate_reel(reel([step(1, marker="same"), step(2, marker="same")]))
    assert any("identical visualisation" in p for p in problems)


def test_non_adjacent_repeat_is_allowed():
    """Returning to an earlier state is fine; only a *wasted tap* is not."""
    assert validate_reel(reel([step(1, marker="a"), step(2, marker="b"), step(3, marker="a")])) == []


def test_caption_alone_does_not_count_as_a_change():
    a, b = step(1, marker="x"), step(2, marker="x")
    b.visualization.caption = "different caption"
    assert any("identical visualisation" in p for p in validate_reel(reel([a, b])))


# ------------------------------------------------------------------ narration
def test_too_short_narration_rejected():
    problems = validate_reel(reel([step(1, audio="Too short."), step(2)]))
    assert any("narration is only" in p for p in problems)


def test_too_long_narration_rejected():
    problems = validate_reel(reel([step(1, audio="word " * 140), step(2)]))
    assert any("too long to listen to" in p for p in problems)


@pytest.mark.parametrize("bad", [
    "We set nums[0] to zero and then continue on through the rest of the array here now",
    "We check whether left == right and then advance both pointers along the array now",
    "The running time is O(n log n) which is much better than the naive approach here",
    "We build a dict {key: value} and then look up each element as we scan across it",
])
def test_code_syntax_in_narration_rejected(bad):
    """It is read aloud by a speech engine — brackets and operators are unspeakable."""
    problems = validate_reel(reel([step(1, audio=bad + " " + NARRATION), step(2)]))
    assert any("code syntax" in p for p in problems)


def test_prose_narration_accepted():
    prose = ("We compare the middle value against our target. Because the array is "
             "sorted, everything to the left of it must also be smaller, so that "
             "whole half can be discarded in a single move without checking it.")
    assert validate_reel(reel([step(1, audio=prose), step(2)])) == []


# ------------------------------------------------------------------ structure
def test_misnumbered_steps_rejected():
    problems = validate_reel(reel([step(1), step(3)]))
    assert any("numbered" in p for p in problems)


def test_blank_explanation_rejected():
    problems = validate_reel(reel([step(1, explanation="   "), step(2)]))
    assert any("no explanation" in p for p in problems)


def test_mock_generator_output_is_valid():
    assert validate_reel(generate_mock("Binary Search", "Binary Search", "Easy", "python")) == []


# ------------------------------------------------------------- curated reels
def test_seed_reels_build():
    assert len(seed_reels.build().reels) == len(seed_reels.REELS)


def test_every_seed_reel_validates():
    for r in seed_reels.build().reels:
        assert validate_reel(r) == [], f"{r.algorithmName}: {validate_reel(r)}"


def test_seed_reels_have_distinct_ids():
    ids = [r.reelId for r in seed_reels.build().reels]
    assert len(ids) == len(set(ids))


def test_seed_reels_cover_every_renderer_shape():
    """The curated set doubles as renderer coverage — losing a shape here means
    a renderer branch stops being exercised by anything."""
    kinds = {s.visualization.kind for r in seed_reels.build().reels for s in r.steps}
    assert {"array", "queue", "tree", "table"} <= kinds


def test_seed_reel_durations_are_estimated():
    assert all(r.durationSeconds >= 15 for r in seed_reels.build().reels)


def test_catalog_entries_are_unique():
    names = [name for name, _, _ in CATALOG]
    assert len(names) == len(set(names))


# --------------------------------------------------------------- shipped file
@pytest.mark.skipif(not os.path.exists(REELS_JSON), reason="reels.json not built")
def test_shipped_reels_parse_and_validate():
    with open(REELS_JSON, encoding="utf-8") as f:
        payload = json.load(f)
    reels = [AlgorithmReel(**r) for r in payload["reels"]]
    assert reels
    for r in reels:
        assert validate_reel(r) == [], f"{r.algorithmName}: {validate_reel(r)}"


def _without_timestamp(reel: dict) -> dict:
    """`generatedAt` is stamped at build time, so it differs on every run and
    says nothing about whether the content drifted."""
    return {k: v for k, v in reel.items() if k != "generatedAt"}


@pytest.mark.skipif(not os.path.exists(REELS_JSON), reason="reels.json not built")
def test_shipped_reels_match_the_source():
    """reels.json is a build artefact of seed_reels.py — if they drift, the app
    is shipping content that is no longer the content under test."""
    with open(REELS_JSON, encoding="utf-8") as f:
        shipped = json.load(f)["reels"]
    built = [_without_timestamp(r) for r in seed_reels.build().model_dump()["reels"]]
    curated = [_without_timestamp(r) for r in shipped if r.get("source") == "curated"]
    assert curated == built, "reels.json is stale — re-run seed_reels.py"
