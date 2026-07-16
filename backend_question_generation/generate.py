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
from curated import classify, neetcode_problems, slug_for


# ---------------------------------------------------------------- input
def load_problems(args) -> list[dict]:
    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else [data]
    if args.neetcode:
        # Seed from the checked-in NeetCode-150 map — no LeetCode scrape needed.
        return neetcode_problems()
    if args.from_db:
        from quickstart import getQuestions  # lazy: needs pymongo + MONGODB_KEY
        return getQuestions() or []
    raise SystemExit("Provide --input <file.json>, --neetcode, or --from-db")


def _tags(problem: dict) -> list[str]:
    tags = problem.get("topicTags") or []
    if tags and isinstance(tags[0], dict):
        tags = [t.get("name", "") for t in tags]
    return [t for t in tags if t][:4] or ["Algorithms"]


# ---------------------------------------------------------------- generators
def _stamp(mset: MCQSet, problem: dict, source: str) -> MCQSet:
    """Authoritatively tag every MCQ with the source problem's curated category,
    lists, slug, and generation source. Runs after generation so the app can
    filter reliably regardless of what the LLM chose. For statement-less sources
    (--neetcode) the model supplies leetQuestionId from its own knowledge, so
    questionIds are re-lettered from it here to guarantee uniqueness."""
    category, lists = classify(problem)
    slug = slug_for(problem)
    letters = "ABCDEFGHIJKLMNOP"
    for i, q in enumerate(mset.questions):
        q.category = category
        q.lists = lists
        q.source = source
        q.sourceSlug = slug
        if not problem.get("questionId"):
            # No trusted numeric id on the source problem — key the id off the
            # slug so ids are unique even if the model mis-remembers a number
            # (leetQuestionId stays as the model's best guess, informational).
            q.questionId = f"{slug}-{letters[i % len(letters)]}"
    return mset


def generate_llm(problem: dict, num: int, model: str) -> MCQSet:
    """OpenAI path: structured output via LangChain."""
    from langchain_openai import ChatOpenAI  # lazy import

    llm = ChatOpenAI(model=model, temperature=0.4).with_structured_output(MCQSet)
    result = llm.invoke([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(problem, num)},
    ])
    return result if isinstance(result, MCQSet) else MCQSet(**result)


_claude_client = None


def generate_claude(problem: dict, num: int, model: str) -> MCQSet:
    """Anthropic path: structured output validated against the MCQSet schema.

    Uses the official SDK's `messages.parse()` helper, which constrains the
    response to the Pydantic schema and validates it. Adaptive thinking is on so
    the model reasons about distractor quality before committing to options.
    """
    global _claude_client
    from anthropic import Anthropic  # lazy import

    if _claude_client is None:
        _claude_client = Anthropic()

    response = _claude_client.messages.parse(
        model=model,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_prompt(problem, num)}],
        output_format=MCQSet,
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("request was declined by safety classifiers")
    if response.parsed_output is None:
        raise RuntimeError(f"structured parse failed (stop_reason={response.stop_reason})")
    return response.parsed_output


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
    src.add_argument("--neetcode", action="store_true",
                     help="Seed from the checked-in NeetCode-150 map (no LeetCode scrape or DB needed).")
    src.add_argument("--from-db", action="store_true", help="Load problems from MongoDB.")
    ap.add_argument("--num", type=int, default=3, help="MCQs to generate per problem (default 3).")
    ap.add_argument("--limit", type=int, default=0, help="Max problems to process (0 = all).")
    ap.add_argument("--provider", choices=["auto", "anthropic", "openai"], default="auto",
                    help="LLM provider. 'auto' picks whichever API key is set (Anthropic preferred).")
    ap.add_argument("--model", default=None,
                    help="Model id. Defaults: claude-opus-4-8 (Anthropic) / gpt-4o-mini (OpenAI). "
                         "Use claude-haiku-4-5 for a ~5x cheaper Anthropic run.")
    ap.add_argument("--app-out", default=None,
                    help="Also write the questions in the app's bundled-deck format "
                         "({\"questions\": [...]}) to this path, e.g. ../LeetSwipe/assets/data/questions.json.")
    ap.add_argument("--mock", action="store_true", help="Use the offline deterministic generator (no API key).")
    ap.add_argument("--fill", action="store_true",
                    help="Top-up mode: skip problems that already have >= --min-per-problem MCQs in Mongo, generate the rest. Idempotent; used by the scheduled top-up job.")
    ap.add_argument("--min-per-problem", type=int, default=3,
                    help="With --fill, the target number of MCQs each problem should have (default 3).")
    ap.add_argument("--dry-run", action="store_true", help="Do not write to MongoDB; print/save instead.")
    ap.add_argument("--out", default="generated_questions.json", help="Output file for --dry-run.")
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
            if (provider == "anthropic" and not have_anthropic) or (provider == "openai" and not have_openai):
                print(f"! {provider.upper()}_API_KEY not set for --provider {provider}.", file=sys.stderr)
                return 2
        if provider is None:
            print("! No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env, "
                  "or use --mock for an offline run.", file=sys.stderr)
            return 2
        if args.model is None:
            args.model = "claude-opus-4-8" if provider == "anthropic" else "gpt-4o-mini"
        print(f"Provider: {provider} · model: {args.model}")

    problems = load_problems(args)

    if args.fill:
        # Skip problems already stocked with enough MCQs so re-runs only fill gaps.
        from quickstart import countByLeetId, countBySlug  # lazy: needs pymongo + MONGODB_KEY
        counts = countByLeetId()
        slug_counts = countBySlug()

        def _needs(p: dict) -> bool:
            if slug_counts.get(slug_for(p), 0) >= args.min_per_problem:
                return False
            try:
                qid = int(p.get("questionId", 0) or 0)
            except (TypeError, ValueError):
                return True
            return qid == 0 or counts.get(qid, 0) < args.min_per_problem

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
            if args.mock:
                mset = generate_mock(problem, args.num)
            elif provider == "anthropic":
                mset = generate_claude(problem, args.num, args.model)
            else:
                mset = generate_llm(problem, args.num, args.model)
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

    if args.app_out:
        # Bundle for the app: the deck loader expects {"questions": [...]}.
        with open(args.app_out, "w", encoding="utf-8") as f:
            json.dump({"questions": [q.model_dump() for q in all_mcqs]}, f, indent=2)
        print(f"Wrote app deck to {args.app_out} ({len(all_mcqs)} questions).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
