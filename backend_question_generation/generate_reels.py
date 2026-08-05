#!/usr/bin/env python3
"""Generate algorithm reels with an LLM.

Same shape as generate.py, for the Learn tab instead of the swipe deck: it
merges into the existing reel set rather than overwriting it, skips algorithms
already covered, and validates before writing.

Validation matters more here than for MCQs. A reel is wrong in ways a schema
cannot catch — highlighting line 12 of an 8-line listing, or emitting two
consecutive steps whose picture is identical — and both land in front of the
learner as an obviously broken animation.

Examples
--------
Offline check of the whole pipeline:
    python generate_reels.py --mock --out /tmp/reels.json

Top up the shipped set, skipping what is already covered:
    python generate_reels.py --fill --out ../LeetSwipe/assets/data/reels.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field

from prompts_reels import FEW_SHOT_EXAMPLE, SYSTEM_PROMPT, build_user_prompt
from schema import AlgorithmReel, ReelSet, ReelStep, Visualization

WORDS_PER_SECOND = 2.6

# Algorithms worth a reel, roughly in teaching order. Category strings match the
# app's topic picker so the Learn filter lines up with the deck's categories.
CATALOG: list[tuple[str, str, str]] = [
    ("Binary Search", "Binary Search", "Easy"),
    ("Two Pointers", "Two Pointers", "Easy"),
    ("Sliding Window", "Sliding Window", "Medium"),
    ("Prefix Sum", "Arrays & Hashing", "Easy"),
    ("Hash Map Frequency Counting", "Arrays & Hashing", "Easy"),
    ("Merge Sort", "Sorting", "Medium"),
    ("Quick Sort", "Sorting", "Medium"),
    ("Heap / Priority Queue", "Heap / Priority Queue", "Medium"),
    ("Breadth-First Search", "Graphs", "Medium"),
    ("Depth-First Search", "Graphs", "Medium"),
    ("Topological Sort", "Graphs", "Hard"),
    ("Dijkstra's Algorithm", "Advanced Graphs", "Hard"),
    ("Union-Find", "Graphs", "Medium"),
    ("Kadane's Algorithm", "1-D Dynamic Programming", "Medium"),
    ("Fibonacci with Memoisation", "1-D Dynamic Programming", "Easy"),
    ("0/1 Knapsack", "1-D Dynamic Programming", "Hard"),
    ("Longest Common Subsequence", "2-D Dynamic Programming", "Hard"),
    ("Backtracking: Subsets", "Backtracking", "Medium"),
    ("Backtracking: N-Queens", "Backtracking", "Hard"),
    ("Trie Insertion and Search", "Tries", "Medium"),
    ("Monotonic Stack", "Stack", "Medium"),
    ("Fast and Slow Pointers", "Linked List", "Easy"),
    ("Reverse a Linked List", "Linked List", "Easy"),
    ("In-Order Tree Traversal", "Trees", "Easy"),
    ("Lowest Common Ancestor", "Trees", "Medium"),
    # --- second wave ---------------------------------------------------
    ("Binary Search on the Answer", "Binary Search", "Hard"),
    ("Cyclic Sort", "Sorting", "Medium"),
    ("Floyd's Cycle Detection", "Linked List", "Medium"),
    ("Merge Intervals", "Intervals", "Medium"),
    ("Sweep Line", "Intervals", "Hard"),
    ("Counting Sort", "Sorting", "Easy"),
    ("Two Heaps for a Median", "Heap / Priority Queue", "Hard"),
    ("Top K with a Heap", "Heap / Priority Queue", "Medium"),
    ("Quickselect", "Sorting", "Medium"),
    ("Matrix Traversal in Spiral Order", "Math & Geometry", "Medium"),
    ("In-Place Matrix Rotation", "Math & Geometry", "Medium"),
    ("Bit Manipulation: XOR Tricks", "Bit Manipulation", "Medium"),
    ("Counting Bits with DP", "Bit Manipulation", "Medium"),
    ("Longest Increasing Subsequence", "1-D Dynamic Programming", "Hard"),
    ("House Robber", "1-D Dynamic Programming", "Medium"),
    ("Coin Change", "1-D Dynamic Programming", "Medium"),
    ("Unique Paths on a Grid", "2-D Dynamic Programming", "Medium"),
    ("Edit Distance", "2-D Dynamic Programming", "Hard"),
    ("Palindromic Substrings", "2-D Dynamic Programming", "Medium"),
    ("Backtracking: Permutations", "Backtracking", "Medium"),
    ("Backtracking: Combination Sum", "Backtracking", "Medium"),
    ("Word Search on a Grid", "Backtracking", "Hard"),
    ("Trie Prefix Search", "Tries", "Medium"),
    ("Kahn's Algorithm", "Graphs", "Medium"),
    ("Number of Islands with DFS", "Graphs", "Medium"),
    ("Multi-Source BFS", "Graphs", "Medium"),
    ("Bellman-Ford", "Advanced Graphs", "Hard"),
    ("Minimum Spanning Tree with Prim's", "Advanced Graphs", "Hard"),
    ("Greedy Interval Scheduling", "Greedy", "Medium"),
    ("Jump Game Greedy", "Greedy", "Medium"),
    ("Monotonic Deque for a Window Maximum", "Sliding Window", "Hard"),
    ("Fast Exponentiation", "Math & Geometry", "Medium"),
    ("Reservoir Sampling", "Math & Geometry", "Hard"),
    ("LRU Cache Design", "Design", "Medium"),
]

# Narration is spoken, so these are tells that the model wrote code instead.
_CODE_ARTEFACTS = re.compile(r"[\[\]{}]|==|!=|\+\+|=>|::|\bO\(")


@dataclass
class ReelReport:
    generated: int = 0
    accepted: int = 0
    rejected: int = 0
    problems: list[tuple[str, str]] = field(default_factory=list)

    def summary(self) -> str:
        line = f"reels: {self.accepted}/{self.generated} accepted"
        if self.rejected:
            line += f", {self.rejected} rejected"
        return line


def _viz_signature(viz: Visualization) -> str:
    """A comparable fingerprint of a step's picture, ignoring the caption."""
    return json.dumps(viz.state, sort_keys=True, default=str)


def validate_reel(reel: AlgorithmReel) -> list[str]:
    """Return the reasons this reel should not ship. Empty means it is fine."""
    problems: list[str] = []
    line_count = len(reel.fullCode.split("\n"))

    for step in reel.steps:
        for line in step.highlightLines:
            if not 1 <= line <= line_count:
                problems.append(
                    f"step {step.stepNumber} highlights line {line}, but the "
                    f"listing has {line_count} lines"
                )
                break

        words = len(step.audioScript.split())
        if words < 20:
            problems.append(f"step {step.stepNumber} narration is only {words} words")
        elif words > 130:
            problems.append(f"step {step.stepNumber} narration is {words} words, too long to listen to")

        if _CODE_ARTEFACTS.search(step.audioScript):
            problems.append(f"step {step.stepNumber} narration contains code syntax; it is read aloud")

        if not step.explanation.strip():
            problems.append(f"step {step.stepNumber} has no explanation")

    # A step that leaves the picture unchanged is a wasted tap.
    for a, b in zip(reel.steps, reel.steps[1:]):
        if _viz_signature(a.visualization) == _viz_signature(b.visualization):
            problems.append(f"steps {a.stepNumber} and {b.stepNumber} show an identical visualisation")

    numbers = [s.stepNumber for s in reel.steps]
    if numbers != list(range(1, len(numbers) + 1)):
        problems.append(f"steps are numbered {numbers}, expected 1..{len(numbers)}")

    return problems


# ---------------------------------------------------------------- generators
_claude_client = None


def generate_claude(algorithm: str, category: str, difficulty: str,
                    language: str, model: str) -> AlgorithmReel:
    global _claude_client
    from anthropic import Anthropic

    if _claude_client is None:
        _claude_client = Anthropic()

    response = _claude_client.messages.parse(
        model=model,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT + "\n\n" + FEW_SHOT_EXAMPLE,
        messages=[{"role": "user", "content": build_user_prompt(
            algorithm, language=language, difficulty=difficulty, category=category)}],
        output_format=AlgorithmReel,
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("request was declined by safety classifiers")
    if response.parsed_output is None:
        raise RuntimeError(f"structured parse failed (stop_reason={response.stop_reason})")
    return response.parsed_output


def generate_openai(algorithm: str, category: str, difficulty: str,
                    language: str, model: str) -> AlgorithmReel:
    from langchain_openai import ChatOpenAI

    # function_calling, not the default strict json_schema mode: a reel step's
    # visualization state is a deliberately free-form dict, and strict mode
    # rejects any schema containing one (additionalProperties must be false).
    llm = ChatOpenAI(model=model, temperature=0.5).with_structured_output(
        AlgorithmReel, method="function_calling")
    result = llm.invoke([
        {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + FEW_SHOT_EXAMPLE},
        {"role": "user", "content": build_user_prompt(
            algorithm, language=language, difficulty=difficulty, category=category)},
    ])
    return result if isinstance(result, AlgorithmReel) else AlgorithmReel(**result)


def generate_mock(algorithm: str, category: str, difficulty: str,
                  language: str) -> AlgorithmReel:
    """Offline stand-in, so the merge/validate/write path is testable with no key."""
    values = [4, 8, 15, 16, 23, 42]
    code = ("def scan(nums):\n"
            "    total = 0\n"
            "    for x in nums:\n"
            "        total += x\n"
            "    return total")

    def cells(active: int) -> Visualization:
        return Visualization(
            kind="array",
            state={"cells": [
                {"value": v,
                 "status": "visited" if i < active else "active" if i == active else "normal",
                 "label": "x" if i == active else ""}
                for i, v in enumerate(values)
            ]},
            caption=f"Read {values[active]}, running total {sum(values[:active + 1])}",
        )

    steps = [
        ReelStep(
            stepNumber=i + 1,
            code="total += x",
            highlightLines=[4],
            explanation=f"Add {values[i]} to the running total, which becomes {sum(values[:i + 1])}.",
            audioScript=(
                f"We read the value {values[i]} and add it to our running total, "
                f"which is now {sum(values[:i + 1])}. Each element is touched exactly once, "
                f"so the work grows in step with the size of the input rather than faster."
            ),
            visualization=cells(i),
        )
        for i in range(len(values))
    ]
    return AlgorithmReel(
        reelId=f"{algorithm.lower().replace(' ', '-').replace('/', '-')}-mock",
        algorithmName=algorithm,
        description=f"A placeholder walkthrough standing in for {algorithm}.",
        hook="Offline placeholder reel.",
        language=language, fullCode=code, steps=steps,
        difficulty=difficulty, category=category, source="mock",
        timeComplexity="O(n)", spaceComplexity="O(1)",
    )


# -------------------------------------------------------------------- output
def load_reels(path: str | None) -> list[dict]:
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"! could not read {path} ({e}); treating as empty.", file=sys.stderr)
        return []
    reels = data.get("reels") if isinstance(data, dict) else data
    return [r for r in (reels or []) if isinstance(r, dict)]


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate algorithm reels.")
    ap.add_argument("--algorithms", nargs="*", help="Specific algorithms. Defaults to the built-in catalog.")
    ap.add_argument("--language", choices=["python", "javascript"], default="python")
    ap.add_argument("--limit", type=int, default=5, help="Max reels this run (default 5).")
    ap.add_argument("--fill", action="store_true",
                    help="Skip algorithms already present in --out. Idempotent; safe to schedule.")
    ap.add_argument("--provider", choices=["auto", "anthropic", "openai"], default="auto")
    ap.add_argument("--model", default=None)
    ap.add_argument("--mock", action="store_true", help="Offline generator, no API key needed.")
    ap.add_argument("--replace", action="store_true", help="Overwrite --out instead of merging into it.")
    ap.add_argument("--out", default="reels.json")
    args = ap.parse_args()

    provider = None
    if not args.mock:
        from dotenv import load_dotenv
        load_dotenv()
        have_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
        have_openai = bool(os.environ.get("OPENAI_API_KEY"))
        if args.provider == "auto":
            provider = "anthropic" if have_anthropic else "openai" if have_openai else None
        else:
            provider = args.provider
        if provider is None:
            print("! No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or use --mock.",
                  file=sys.stderr)
            return 2
        if args.model is None:
            args.model = "claude-opus-4-8" if provider == "anthropic" else "gpt-4o-mini"
        print(f"Provider: {provider} · model: {args.model}")

    existing = [] if args.replace else load_reels(args.out)
    covered = {str(r.get("algorithmName", "")).lower() for r in existing}
    if existing:
        print(f"Existing reels: {len(existing)} ({len(covered)} algorithms).")

    if args.algorithms:
        catalog = [(a, "", "Medium") for a in args.algorithms]
    else:
        catalog = CATALOG

    if args.fill:
        before = len(catalog)
        catalog = [c for c in catalog if c[0].lower() not in covered]
        print(f"--fill: {before - len(catalog)} already covered; {len(catalog)} to generate.")
    if args.limit:
        catalog = catalog[: args.limit]

    if not catalog:
        print("Nothing to generate — every algorithm in the catalog already has a reel.")
        return 0

    report = ReelReport()
    accepted: list[AlgorithmReel] = []

    for i, (algorithm, category, difficulty) in enumerate(catalog, 1):
        try:
            if args.mock:
                reel = generate_mock(algorithm, category, difficulty, args.language)
            elif provider == "anthropic":
                reel = generate_claude(algorithm, category, difficulty, args.language, args.model)
            else:
                reel = generate_openai(algorithm, category, difficulty, args.language, args.model)
        except Exception as e:  # keep going on a single failure
            print(f"[{i}/{len(catalog)}] {algorithm}: FAILED — {e}", file=sys.stderr)
            continue

        report.generated += 1
        # Trust the catalog over the model for taxonomy, exactly as the MCQ
        # pipeline stamps category and lists after generation.
        if category:
            reel.category = category
        reel.source = "mock" if args.mock else "llm"
        words = sum(len(s.audioScript.split()) for s in reel.steps)
        reel.durationSeconds = max(15, round(words / WORDS_PER_SECOND))

        problems = validate_reel(reel)
        if problems:
            report.rejected += 1
            report.problems.extend((algorithm, p) for p in problems)
            print(f"[{i}/{len(catalog)}] {algorithm}: REJECTED — {problems[0]}", file=sys.stderr)
            continue

        report.accepted += 1
        accepted.append(reel)
        print(f"[{i}/{len(catalog)}] {algorithm}: {len(reel.steps)} steps, ~{reel.durationSeconds}s")

    print(f"\n{report.summary()}")
    for algorithm, problem in report.problems[:8]:
        print(f"  {algorithm}: {problem}")

    if not accepted:
        if report.generated == 0 and not args.mock:
            print("! Nothing generated — every algorithm failed. See errors above.", file=sys.stderr)
            return 1
        print("Nothing new to write. Existing reels left untouched.")
        return 0

    # Drop anything whose id already exists, so a re-run cannot double up.
    existing_ids = {str(r.get("reelId", "")) for r in existing}
    fresh = [r.model_dump() for r in accepted if r.reelId not in existing_ids]
    merged = existing + fresh

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"reels": merged}, f, indent=2)
    print(f"Wrote {args.out}: {len(existing)} existing + {len(fresh)} new = {len(merged)} reels.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
