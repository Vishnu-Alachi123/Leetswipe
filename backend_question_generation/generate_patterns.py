#!/usr/bin/env python3
"""Generate Pattern Match questions: read a problem, name the technique.

The skill this trains is the one interviews actually test and no prep tool
drills — recognising, before writing anything, which of the ~18 techniques a
problem wants.

The important property here is that **the answer key is not generated**. Each
NeetCode-150 problem already carries a curated category, so the correct answer
comes from the checked-in map. The model is only asked to write a disguised
restatement of the problem — it never decides what the right answer is, which
removes the usual worry about a confidently-wrong label.

Distractors are chosen deliberately (see CONFUSABLE): the techniques a learner
would plausibly reach for on that problem, not three random categories, because
a question whose wrong options are obviously wrong teaches nothing.

    python generate_patterns.py --limit 40 --out ../LeetSwipe/assets/data/patterns.json
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys

from curated import categories as curated_categories

_HERE = os.path.dirname(os.path.abspath(__file__))
_NEETCODE_PATH = os.path.join(_HERE, "lists", "neetcode150.json")

SYSTEM_PROMPT = """You write short problem statements for a technique-recognition
drill. The learner reads your statement and picks which algorithmic technique it
calls for.

Rules:

1. DISGUISE IT. Restate the problem in your own words, in a concrete scenario if
   that helps. Never use the problem's well-known name, and avoid the words that
   give the technique away for free — do not write "sliding window", "two
   pointers", "binary search", "dynamic programming", "backtracking", or "heap".

2. KEEP THE SIGNAL. The statement must still contain what a trained reader uses
   to identify the technique: whether the input is sorted, whether you need a
   contiguous run, whether you need the k largest, whether subproblems repeat.
   Disguise the name, not the structure.

3. BE SHORT. Two or three sentences. This is a ten-second drill, not a reading
   comprehension test.

4. INCLUDE CONSTRAINTS when they are the tell. "n can be up to a million"
   legitimately rules out quadratic approaches, and reading constraints is part
   of the skill.

5. WRITE THE REVEAL. `insight` is one or two sentences naming the technique and
   the specific clue in your statement that pointed to it. This is shown after
   the learner answers, and it is where the actual teaching happens.

Return only the structured result."""


def build_user_prompt(title: str, category: str, difficulty: str) -> str:
    return (
        f"Problem: {title}\n"
        f"Technique (the answer — do not name it in the statement): {category}\n"
        f"Difficulty: {difficulty}\n\n"
        "Write the disguised statement and the reveal."
    )


# Techniques a learner plausibly confuses with each key one. Hand-written
# because the confusions are specific: nobody mistakes a Trie problem for
# Greedy, but Two Pointers vs Sliding Window catches people constantly.
CONFUSABLE: dict[str, list[str]] = {
    "Arrays & Hashing": ["Two Pointers", "Sliding Window", "Sorting", "Binary Search"],
    "Two Pointers": ["Sliding Window", "Binary Search", "Arrays & Hashing", "Greedy"],
    "Sliding Window": ["Two Pointers", "Arrays & Hashing", "1-D Dynamic Programming", "Greedy"],
    "Stack": ["Arrays & Hashing", "Two Pointers", "Linked List", "Greedy"],
    "Binary Search": ["Two Pointers", "Arrays & Hashing", "Greedy", "Sorting"],
    "Linked List": ["Two Pointers", "Stack", "Arrays & Hashing", "Trees"],
    "Trees": ["Graphs", "Backtracking", "Heap / Priority Queue", "1-D Dynamic Programming"],
    "Heap / Priority Queue": ["Sorting", "Arrays & Hashing", "Greedy", "Binary Search"],
    "Backtracking": ["1-D Dynamic Programming", "Graphs", "Greedy", "Trees"],
    "Tries": ["Arrays & Hashing", "Trees", "Backtracking", "Graphs"],
    "Graphs": ["Trees", "Backtracking", "1-D Dynamic Programming", "Advanced Graphs"],
    "Advanced Graphs": ["Graphs", "Greedy", "Heap / Priority Queue", "1-D Dynamic Programming"],
    "1-D Dynamic Programming": ["Greedy", "Sliding Window", "Backtracking", "2-D Dynamic Programming"],
    "2-D Dynamic Programming": ["1-D Dynamic Programming", "Backtracking", "Graphs", "Greedy"],
    "Greedy": ["1-D Dynamic Programming", "Sorting", "Intervals", "Heap / Priority Queue"],
    "Intervals": ["Sorting", "Greedy", "Two Pointers", "Heap / Priority Queue"],
    "Math & Geometry": ["Arrays & Hashing", "Bit Manipulation", "Two Pointers", "Greedy"],
    "Bit Manipulation": ["Math & Geometry", "Arrays & Hashing", "1-D Dynamic Programming", "Greedy"],
}


def options_for(category: str, rng: random.Random, all_categories: list[str]) -> tuple[list[str], int]:
    """Four options containing `category`, with plausible distractors."""
    pool = [c for c in CONFUSABLE.get(category, []) if c != category]
    # Top up from the full list if the hand-written pool runs short.
    if len(pool) < 3:
        pool += [c for c in all_categories if c != category and c not in pool]
    distractors = rng.sample(pool[: max(4, len(pool))], 3)
    options = distractors + [category]
    rng.shuffle(options)
    return options, options.index(category)


def load_problems() -> list[dict]:
    with open(_NEETCODE_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return [
        {"slug": slug, **info}
        for slug, info in data.get("bySlug", {}).items()
        if info.get("category") and info.get("title")
    ]


def generate_statement(problem: dict, provider: str, model: str) -> tuple[str, str]:
    """Return (disguised statement, insight). Raises on failure."""
    from pydantic import BaseModel, Field

    class Statement(BaseModel):
        statement: str = Field(description="Two or three sentences restating the problem without naming the technique.")
        insight: str = Field(description="One or two sentences: the technique, and the clue in the statement that pointed to it.")

    prompt = build_user_prompt(problem["title"], problem["category"], problem.get("difficulty", "Medium"))

    if provider == "anthropic":
        from anthropic import Anthropic

        response = Anthropic().messages.parse(
            model=model, max_tokens=2000, system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}], output_format=Statement,
        )
        if response.parsed_output is None:
            raise RuntimeError(f"structured parse failed ({response.stop_reason})")
        result = response.parsed_output
    else:
        from langchain_openai import ChatOpenAI

        result = ChatOpenAI(model=model, temperature=0.6).with_structured_output(Statement).invoke(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}]
        )
        if not isinstance(result, Statement):
            result = Statement(**result)

    return result.statement.strip(), result.insight.strip()


# Words that would hand the answer over. Checked after generation because the
# instruction not to use them is not always obeyed.
LEAKY = [
    "sliding window", "two pointer", "binary search", "dynamic programming",
    "backtrack", "priority queue", "min-heap", "max-heap", "hash map",
    "hash set", "trie", "union-find", "topological", "dijkstra", "memoi",
]


def leaks(statement: str) -> str | None:
    low = statement.lower()
    for word in LEAKY:
        if word in low:
            return word
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate Pattern Match questions.")
    ap.add_argument("--limit", type=int, default=30, help="Max questions this run.")
    ap.add_argument("--fill", action="store_true", help="Skip problems already covered in --out.")
    ap.add_argument("--provider", choices=["auto", "anthropic", "openai"], default="auto")
    ap.add_argument("--model", default=None)
    ap.add_argument("--mock", action="store_true", help="Offline generator, no API key.")
    ap.add_argument("--seed", type=int, default=7, help="Seed for distractor choice, so runs are reproducible.")
    ap.add_argument("--out", default="../LeetSwipe/assets/data/patterns.json")
    args = ap.parse_args()

    provider = None
    if not args.mock:
        from dotenv import load_dotenv
        load_dotenv()
        have_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
        have_openai = bool(os.environ.get("OPENAI_API_KEY"))
        provider = (
            "anthropic" if (args.provider in {"auto", "anthropic"} and have_anthropic)
            else "openai" if have_openai else None
        )
        if provider is None:
            print("! No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or use --mock.", file=sys.stderr)
            return 2
        if args.model is None:
            args.model = "claude-opus-4-8" if provider == "anthropic" else "gpt-4o"
        print(f"Provider: {provider} · model: {args.model}")

    existing: list[dict] = []
    if os.path.exists(args.out):
        try:
            with open(args.out, encoding="utf-8") as f:
                existing = json.load(f).get("questions", [])
        except (OSError, json.JSONDecodeError):
            existing = []
    covered = {q.get("sourceSlug") for q in existing}
    if existing:
        print(f"Existing pattern questions: {len(existing)}")

    problems = load_problems()
    if args.fill:
        before = len(problems)
        problems = [p for p in problems if p["slug"] not in covered]
        print(f"--fill: {before - len(problems)} already covered; {len(problems)} to go.")
    problems = problems[: args.limit] if args.limit else problems

    if not problems:
        print("Nothing to generate — every problem already has a pattern question.")
        return 0

    rng = random.Random(args.seed)
    all_categories = curated_categories() or sorted(CONFUSABLE)
    made: list[dict] = []
    rejected = 0

    for i, problem in enumerate(problems, 1):
        category = problem["category"]
        try:
            if args.mock:
                statement = (
                    f"You are given input for a task in the style of {problem['title']}, "
                    "and must produce the required result efficiently for large inputs."
                )
                insight = f"This is a {category} problem."
            else:
                statement, insight = generate_statement(problem, provider, args.model)
        except Exception as e:  # keep going on a single failure
            print(f"[{i}/{len(problems)}] {problem['title']}: FAILED — {e}", file=sys.stderr)
            continue

        leaked = leaks(statement)
        if leaked and not args.mock:
            rejected += 1
            print(f"[{i}/{len(problems)}] {problem['title']}: REJECTED — statement names '{leaked}'", file=sys.stderr)
            continue

        options, answer = options_for(category, rng, all_categories)
        made.append({
            "questionId": f"pattern-{problem['slug']}",
            "sourceSlug": problem["slug"],
            "title": problem["title"],
            "statement": statement,
            "options": options,
            "answer": answer,
            "category": category,
            "difficulty": problem.get("difficulty", "Medium"),
            "insight": insight,
            "source": "mock" if args.mock else "llm",
        })
        print(f"[{i}/{len(problems)}] {problem['title']} → {category}")

    if not made:
        print("Nothing new to write.", file=sys.stderr)
        return 1 if not args.mock else 0

    seen = {q["questionId"] for q in existing}
    fresh = [q for q in made if q["questionId"] not in seen]
    merged = existing + fresh
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"questions": merged}, f, indent=2)

    print(f"\n{len(fresh)} new, {rejected} rejected for leaking the answer.")
    print(f"Wrote {args.out}: {len(existing)} existing + {len(fresh)} new = {len(merged)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
