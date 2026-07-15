#!/usr/bin/env python3
"""LeetSwipe — MCQ generation pipeline.

Reads LeetCode problems, generates multiple-choice questions from each, and
either writes them to MongoDB or dumps them to a JSON file.

Examples
--------
Offline dry-run (no API key, no DB) — great for testing the pipeline:
    python generate.py --input ../leetData.json --mock --dry-run

Real generation with OpenAI, write to a file:
    python generate.py --input ../leetData.json --num 5 --dry-run --out out.json

Real generation, load problems from Mongo and write MCQs back to Mongo:
    python generate.py --from-db --num 5

Environment (.env): OPENAI_API_KEY, MONGODB_KEY
"""
import argparse
import json
import os
import sys

from schema import MCQ, MCQSet
from prompts import SYSTEM_PROMPT, build_user_prompt
from curated import classify


# ---------------------------------------------------------------- input
def load_problems(args) -> list[dict]:
    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else [data]
    if args.from_db:
        from quickstart import getQuestions  # lazy: needs pymongo + MONGODB_KEY
        return getQuestions() or []
    raise SystemExit("Provide --input <file.json> or --from-db")


def _tags(problem: dict) -> list[str]:
    tags = problem.get("topicTags") or []
    if tags and isinstance(tags[0], dict):
        tags = [t.get("name", "") for t in tags]
    return [t for t in tags if t][:4] or ["Algorithms"]


# ---------------------------------------------------------------- generators
def _stamp(mset: MCQSet, problem: dict, source: str) -> MCQSet:
    """Authoritatively tag every MCQ with the source problem's curated category,
    lists, and generation source. Runs after generation so the app can filter
    reliably regardless of what the LLM chose."""
    category, lists = classify(problem)
    for q in mset.questions:
        q.category = category
        q.lists = lists
        q.source = source
    return mset


def generate_llm(problem: dict, num: int, model: str) -> MCQSet:
    """Production path: OpenAI structured output via LangChain."""
    from langchain_openai import ChatOpenAI  # lazy import

    llm = ChatOpenAI(model=model, temperature=0.4).with_structured_output(MCQSet)
    result = llm.invoke([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(problem, num)},
    ])
    return result if isinstance(result, MCQSet) else MCQSet(**result)


def generate_mock(problem: dict, num: int) -> MCQSet:
    """Offline path: deterministic, metadata-driven MCQs so the pipeline is
    testable without an API key. Not a substitute for the LLM's quality."""
    qid = int(problem.get("questionId", 0) or 0)
    title = problem.get("title", "the problem")
    diff = problem.get("difficulty", "Medium")
    tags = _tags(problem)
    primary = tags[0]

    templates = [
        {
            "title": f"Choosing a data structure for {title}",
            "question": f"Which data structure most directly enables an efficient solution to a problem tagged '{primary}'?",
            "options": [primary + " / hash-based lookup", "A doubly linked list", "A min-heap of all inputs", "A balanced BST of characters"],
            "answer": 0,
            "explanation": f"Problems tagged '{primary}' are typically solved most efficiently with that structure's core operation, avoiding an O(n^2) scan.",
        },
        {
            "title": f"Complexity tradeoffs in {title}",
            "question": "Trading extra memory for speed, what is the usual time complexity of the optimal approach here?",
            "options": ["O(n^2)", "O(n log n)", "O(n)", "O(2^n)"],
            "answer": 2,
            "explanation": "A single pass with an auxiliary structure typically reduces a quadratic brute force to linear time.",
        },
        {
            "title": f"Edge cases in {title}",
            "question": "Which edge case most often breaks a naive solution to this problem?",
            "options": ["Duplicate or repeated values", "A perfectly sorted input", "An input of length exactly 2", "Using recursion"],
            "answer": 0,
            "explanation": "Duplicates and boundary inputs commonly expose off-by-one or overwrite bugs in naive approaches.",
        },
        {
            "title": f"Brute force vs. optimal for {title}",
            "question": "Why is the brute-force approach usually rejected for this problem at scale?",
            "options": ["It gives wrong answers", "Its quadratic time is too slow for large inputs", "It cannot be written in Python", "It uses too little memory"],
            "answer": 1,
            "explanation": "Brute force is correct but its O(n^2) work is prohibitive as n grows; an optimized method scales better.",
        },
        {
            "title": f"Recognizing the pattern behind {title}",
            "question": f"Encountering a new problem, which signal suggests reaching for a '{primary}' technique?",
            "options": ["The need for fast membership or pairing lookups", "The presence of floating-point math", "A requirement to print output", "The input being a single integer"],
            "answer": 0,
            "explanation": f"'{primary}' shines when you repeatedly need fast lookups or pairings, turning nested loops into a single pass.",
        },
    ]

    letters = "ABCDEFGHIJ"
    out = []
    for i in range(min(num, len(templates))):
        t = templates[i]
        out.append(MCQ(
            leetQuestionId=qid,
            questionId=f"{qid}{letters[i]}",
            title=t["title"],
            topics=tags,
            difficulty=diff,
            question=t["question"],
            options=t["options"],
            answer=t["answer"],
            explanation=t["explanation"],
        ))
    return MCQSet(questions=out)


# ---------------------------------------------------------------- output
def dedupe(mcqs: list[MCQ]) -> list[MCQ]:
    seen, out = set(), []
    for q in mcqs:
        if q.questionId in seen:
            continue
        seen.add(q.questionId)
        out.append(q)
    return out


def write_db(mcqs: list[MCQ]) -> None:
    from quickstart import postQuestions, ensureIndexes  # lazy
    postQuestions(MCQSet(questions=mcqs))
    ensureIndexes()


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description="Generate LeetSwipe MCQs.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--input", help="Path to a JSON file of LeetCode problems.")
    src.add_argument("--from-db", action="store_true", help="Load problems from MongoDB.")
    ap.add_argument("--num", type=int, default=5, help="MCQs to generate per problem (default 5).")
    ap.add_argument("--limit", type=int, default=0, help="Max problems to process (0 = all).")
    ap.add_argument("--model", default="gpt-4o-mini", help="OpenAI model (default gpt-4o-mini).")
    ap.add_argument("--mock", action="store_true", help="Use the offline deterministic generator (no API key).")
    ap.add_argument("--fill", action="store_true",
                    help="Top-up mode: skip problems that already have >= --min-per-problem MCQs in Mongo, generate the rest. Idempotent; used by the scheduled top-up job.")
    ap.add_argument("--min-per-problem", type=int, default=3,
                    help="With --fill, the target number of MCQs each problem should have (default 3).")
    ap.add_argument("--dry-run", action="store_true", help="Do not write to MongoDB; print/save instead.")
    ap.add_argument("--out", default="generated_questions.json", help="Output file for --dry-run.")
    args = ap.parse_args()

    if not args.mock:
        from dotenv import load_dotenv
        load_dotenv()
        if not os.environ.get("OPENAI_API_KEY"):
            print("! OPENAI_API_KEY not set. Use --mock for an offline run.", file=sys.stderr)
            return 2

    problems = load_problems(args)

    if args.fill:
        # Skip problems already stocked with enough MCQs so re-runs only fill gaps.
        from quickstart import countByLeetId  # lazy: needs pymongo + MONGODB_KEY
        counts = countByLeetId()

        def _needs(p: dict) -> bool:
            try:
                qid = int(p.get("questionId", 0) or 0)
            except (TypeError, ValueError):
                return True
            return counts.get(qid, 0) < args.min_per_problem

        before = len(problems)
        problems = [p for p in problems if _needs(p)]
        print(f"--fill: {before - len(problems)} problems already stocked "
              f"(>= {args.min_per_problem} MCQs); {len(problems)} to top up.")

    if args.limit:
        problems = problems[: args.limit]
    if not problems:
        print("No problems to process.", file=sys.stderr)
        return 1

    all_mcqs: list[MCQ] = []
    for i, problem in enumerate(problems, 1):
        title = problem.get("title", f"#{i}")
        try:
            mset = generate_mock(problem, args.num) if args.mock else generate_llm(problem, args.num, args.model)
            _stamp(mset, problem, "mock" if args.mock else "llm")
            all_mcqs.extend(mset.questions)
            print(f"[{i}/{len(problems)}] {title}: +{len(mset.questions)} MCQs")
        except Exception as e:  # keep going on a single failure
            print(f"[{i}/{len(problems)}] {title}: FAILED — {e}", file=sys.stderr)

    all_mcqs = dedupe(all_mcqs)
    print(f"\nGenerated {len(all_mcqs)} unique MCQs from {len(problems)} problems.")

    if args.dry_run:
        payload = [q.model_dump() for q in all_mcqs]
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        print(f"Wrote {args.out} (dry-run — nothing sent to MongoDB).")
    else:
        write_db(all_mcqs)
        print("Wrote MCQs to MongoDB.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
