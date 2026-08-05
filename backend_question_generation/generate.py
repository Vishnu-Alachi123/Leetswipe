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

import deduplication
import quality
from schema import MCQ, MCQSet, StoredMCQ
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
def _stamp(mset: MCQSet, problem: dict, source: str, id_offset: int = 0) -> MCQSet:
    """Authoritatively tag every MCQ with the source problem's curated category,
    lists, slug, and generation source. Runs after generation so the app can
    filter reliably regardless of what the LLM chose. For statement-less sources
    (--neetcode) the model supplies leetQuestionId from its own knowledge, so
    questionIds are re-numbered from the slug here to guarantee uniqueness.

    `id_offset` is how many questions this problem already has. Top-up runs pass
    it so a second pass over `two-sum` numbers its questions -4, -5, -6 instead
    of colliding with the -1, -2, -3 already in the deck.
    """
    category, lists = classify(problem)
    slug = slug_for(problem)
    for i, q in enumerate(mset.questions):
        q.category = category
        q.lists = lists
        q.source = source
        q.sourceSlug = slug
        if not problem.get("questionId"):
            # No trusted numeric id on the source problem — key the id off the
            # slug so ids are unique even if the model mis-remembers a number
            # (leetQuestionId stays as the model's best guess, informational).
            # A numeric suffix (not a wrapping letter) stays unique for any --num.
            q.questionId = f"{slug}-{id_offset + i + 1}"
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

    # These stand in for real generation offline, so they are written to clear
    # the same quality gate the LLM output has to clear (see quality.py): no
    # wording shared between a stem and its correct option, four options of
    # comparable length, and explanations that name why the runner-up loses.
    templates = [
        {
            "title": f"Choosing a data structure for {title}",
            "question": "You must repeatedly ask whether a value has already been encountered, while touching each element only once. Which structure supports that access pattern best?",
            "options": [
                "A hash set",
                "A sorted array searched by bisection",
                "A min-heap ordered by value",
                "A doubly linked list of seen values",
            ],
            "answer": 0,
            "explanation": "A hash set answers membership in O(1) on average, so one pass over the input is enough. The bisected array is the tempting runner-up because its lookups are O(log n), but keeping it ordered costs O(n) per insertion, which is strictly worse. A heap orders by value and cannot test membership, and scanning a linked list is linear per query.",
        },
        {
            "title": f"Complexity tradeoffs in {title}",
            "question": "Suppose the naive approach compares every pair of elements, and you are permitted to spend extra memory to avoid that. What running time should the improved version reach?",
            "options": ["O(n^2)", "O(n log n)", "O(n)", "O(2^n)"],
            "answer": 2,
            "explanation": "Spending O(n) auxiliary space to remember what has been seen removes the inner loop entirely, leaving a single pass at O(n). O(n log n) is the tempting answer because sorting also beats quadratic, but sorting is unnecessary here and does strictly more work. O(n^2) is the cost being eliminated, and O(2^n) describes exhaustive enumeration, not this pattern.",
        },
        {
            "title": f"Edge cases in {title}",
            "question": "A candidate's solution passes the sample tests but fails on hidden cases. Which characteristic of the input is the most common cause?",
            "options": [
                "An input that arrives already ordered",
                "An input holding exactly two elements",
                "A solution written recursively",
                "Repeated values appearing more than once",
            ],
            "answer": 3,
            "explanation": "Repeats break code that assumes each value is distinct — a lookup table keyed by value silently overwrites the earlier entry, so one occurrence is lost. Pre-ordered input is the tempting choice, but it usually makes these problems easier rather than harder. A two-element input is a boundary worth testing yet rarely the failure, and recursion is an implementation choice, not a property of the data.",
        },
        {
            "title": f"Brute force vs. optimal for {title}",
            "question": "An interviewer accepts the exhaustive nested-loop solution but immediately asks for a better one. What is their objection?",
            "options": [
                "It returns the wrong result on valid input",
                "Its quadratic growth is too slow once the input is large",
                "It cannot be expressed in most languages",
                "It consumes too little auxiliary memory",
            ],
            "answer": 1,
            "explanation": "The exhaustive version is correct; the objection is purely about growth, since doubling the input quadruples the work and large cases time out. Claiming it returns wrong results is the tempting misread of the question — correctness is not the issue here. Language support is irrelevant, and using little memory is a virtue rather than a defect.",
        },
        {
            "title": f"Recognizing the pattern behind {title}",
            "question": f"You meet an unfamiliar problem and suspect a '{primary}' approach applies. Which property of the task is the strongest signal?",
            "options": [
                "Values must be located or paired quickly and often",
                "The computation involves floating-point rounding",
                "The result has to be printed in a given format",
                "The entire input is a single integer",
            ],
            "answer": 0,
            "explanation": "The technique pays off precisely when the same lookup is performed many times, since replacing repeated scans with direct access collapses a nested loop into one pass. Floating-point rounding is a tempting distractor because it feels algorithmic, but it concerns numerical precision and not access patterns. Output formatting is presentation, and a single scalar input leaves nothing to index.",
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


# ---------------------------------------------------------------- bundled deck
def load_app_deck(path: str | None) -> list[dict]:
    """Read the app's bundled deck, or an empty list if there isn't one yet."""
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"! could not read existing deck at {path} ({e}); treating as empty.", file=sys.stderr)
        return []
    questions = data.get("questions") if isinstance(data, dict) else data
    return [q for q in (questions or []) if isinstance(q, dict)]


def stock_by_slug(questions: list[dict]) -> dict[str, int]:
    """How many questions each source problem already has."""
    counts: dict[str, int] = {}
    for q in questions:
        slug = str(q.get("sourceSlug") or "")
        if slug:
            counts[slug] = counts.get(slug, 0) + 1
    return counts


def write_app_deck(path: str, existing: list[dict], new: list[dict]) -> None:
    """Write ``existing + new`` to the bundled deck.

    Merging rather than overwriting is the whole point: the deck is cumulative,
    and a scheduled run that only touches 40 of 150 problems must not throw the
    other 110 away.
    """
    merged = existing + new
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"questions": merged}, f, indent=2)
    print(f"Wrote app deck to {path}: {len(existing)} existing + {len(new)} new = {len(merged)} questions.")


# ---------------------------------------------------------------- output
def dedupe(mcqs: list[MCQ]) -> list[MCQ]:
    seen, out = set(), []
    for q in mcqs:
        if q.questionId in seen:
            continue
        seen.add(q.questionId)
        out.append(q)
    return out


def write_db(mcqs: list) -> None:
    from quickstart import postQuestions, ensureIndexes  # lazy
    postQuestions(MCQSet(questions=[MCQ(**q.model_dump(include=set(MCQ.model_fields))) for q in mcqs]))
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
                    help="Top-up mode: skip problems that already have >= --min-per-problem MCQs, generate the rest. "
                         "Idempotent; used by the scheduled top-up job. Problems are processed fewest-first, so "
                         "successive runs rotate through the pool instead of re-generating the same ones.")
    ap.add_argument("--min-per-problem", type=int, default=3,
                    help="With --fill, the target number of MCQs each problem should have (default 3). "
                         "Raise this to grow the deck; runs become free no-ops once every problem hits the target.")
    ap.add_argument("--fill-source", choices=["auto", "db", "bundle"], default="auto",
                    help="Where --fill reads current stock from. 'auto' uses the --app-out deck when one is given "
                         "and MongoDB is not being written, otherwise MongoDB.")
    ap.add_argument("--app-replace", action="store_true",
                    help="Overwrite the --app-out deck instead of merging into it. Destructive; the default merges.")
    ap.add_argument("--min-quality", type=int, default=quality.DEFAULT_MIN_SCORE,
                    help=f"Drop generated questions scoring below this (1-5, default {quality.DEFAULT_MIN_SCORE}). Use 1 to keep everything.")
    ap.add_argument("--llm-review", action="store_true",
                    help="Add a semantic review pass over the heuristic checks. Costs one extra (small) call per problem.")
    ap.add_argument("--dedupe-scope", choices=["problem", "global"], default="problem",
                    help="'problem' (default) only treats repeats within one source problem as duplicates; "
                         "'global' also drops questions that repeat across different problems.")
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

    # The deck we are adding to. Read up-front: it supplies both the duplicate
    # baseline and, for --fill, the current stock per problem.
    existing_deck = [] if args.app_replace else load_app_deck(args.app_out)
    if existing_deck:
        print(f"Existing app deck: {len(existing_deck)} questions across "
              f"{len(stock_by_slug(existing_deck))} problems.")

    fill_source = args.fill_source
    if fill_source == "auto":
        fill_source = "bundle" if (args.app_out and args.dry_run) else "db"

    slug_counts: dict[str, int] = {}
    if args.fill:
        # Skip problems already stocked so re-runs only fill gaps.
        if fill_source == "bundle":
            slug_counts = stock_by_slug(existing_deck)
            counts: dict[int, int] = {}
        else:
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
        # Fewest-first, so a --limit'd run works on the thinnest problems and
        # successive runs rotate through the pool instead of hammering the
        # first 40 alphabetically forever.
        problems.sort(key=lambda p: slug_counts.get(slug_for(p), 0))
        print(f"--fill ({fill_source}): {before - len(problems)} problems already stocked "
              f"(>= {args.min_per_problem} each); {len(problems)} to top up.")
    elif existing_deck:
        slug_counts = stock_by_slug(existing_deck)

    if args.limit:
        problems = problems[: args.limit]
    if not problems:
        if args.fill:
            # Every problem is already at target. That is success, not failure —
            # a scheduled job must not go red (or spend a token) for it.
            print(f"Nothing to top up: every problem already has >= {args.min_per_problem} "
                  f"questions. Raise --min-per-problem to grow the deck.")
            return 0
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
            # Number new ids past whatever this problem already has, so a top-up
            # run extends the series instead of colliding with it.
            _stamp(mset, problem, "mock" if args.mock else "llm",
                   id_offset=slug_counts.get(slug_for(problem), 0))
            all_mcqs.extend(mset.questions)
            print(f"[{i}/{len(problems)}] {title}: +{len(mset.questions)} MCQs")
        except Exception as e:  # keep going on a single failure
            print(f"[{i}/{len(problems)}] {title}: FAILED — {e}", file=sys.stderr)

    all_mcqs = dedupe(all_mcqs)
    generated = len(all_mcqs)
    print(f"\nGenerated {generated} MCQs from {len(problems)} problems.")

    # ---- quality gate -----------------------------------------------------
    scored, qreport = quality.filter_questions(all_mcqs, min_score=args.min_quality)
    print(qreport.summary())

    if args.llm_review and provider and scored:
        verdicts = quality.review_with_llm(
            [q for q, _ in scored], model=args.model, provider=provider,
        )
        reviewed = []
        for (q, result), (accepted, score, reason) in zip(scored, verdicts):
            if not accepted:
                print(f"  reviewer rejected {q.questionId}: {reason}")
                continue
            result.score = min(result.score, score)
            reviewed.append((q, result))
        print(f"llm review: {len(reviewed)}/{len(scored)} kept")
        scored = reviewed

    # Carry the verdict onto the record so a later pass can audit it.
    stored: list[StoredMCQ] = [
        StoredMCQ.from_mcq(
            q,
            contentHash=deduplication.question_hash(q.model_dump()),
            qualityScore=result.score,
            explanationQuality=result.explanation_score,
            qualityFlags=result.flags,
        )
        for q, result in scored
    ]

    # ---- duplicate gate ---------------------------------------------------
    all_mcqs, dreport = deduplication.deduplicate(
        stored, existing_deck, scope=args.dedupe_scope,
    )
    print(dreport.summary())

    if not all_mcqs:
        if generated == 0 and not args.mock:
            # Every problem failed (bad key, wrong model, network down, etc). Fail
            # loudly instead of exiting 0 with nothing written — a scheduled job
            # (or CI) should surface this as a failure, not a silent no-op.
            print("! No MCQs were generated — every problem failed. See errors above.", file=sys.stderr)
            return 1
        # Generation worked; the gates just rejected everything as duplicate or
        # low-quality. Nothing to write, but nothing is broken either.
        print("Nothing new to write — every generated question was a duplicate or "
              "below the quality bar. Existing deck left untouched.")
        return 0

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
        # `existing_deck` is empty when --app-replace was passed, which is the
        # only way to get the old overwrite behaviour.
        write_app_deck(args.app_out, existing_deck, [q.model_dump() for q in all_mcqs])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
