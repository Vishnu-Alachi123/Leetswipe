"""Quality gate for generated MCQs.

Every check here is a heuristic that runs offline, for free, and deterministically
— which matters, because the alternative (asking an LLM to grade its own output)
doubles the cost of every run and cannot be unit-tested. These catch the failure
modes that actually show up in generated question banks:

* the correct answer is guessable without knowing the material (it is the
  longest option, or its wording is echoed in the stem),
* two options mean the same thing, so there are really only three choices,
* the explanation asserts the answer instead of teaching it.

`review_with_llm` is available on top for a semantic pass, but it is opt-in.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Sequence

# Docked from the starting score of 5. Anything that makes a question *guessable*
# costs more than anything that merely makes it terse.
FLAG_PENALTIES: dict[str, int] = {
    "duplicate-options": 3,
    "answer-leakage": 3,
    "option-length-tell": 2,
    "option-prefixes": 1,
    "stem-too-short": 2,
    "explanation-too-short": 1,
    "explanation-asserts-only": 1,
    "explanation-repeats-option": 1,
}

# Below this a question is dropped rather than shipped.
DEFAULT_MIN_SCORE = 3

_WS = re.compile(r"\s+")
# Strip decoration (quotes, brackets, commas) but *keep* operators: "O(m + n)"
# and "O(m * n)" are different complexities, and folding them together would
# make two perfectly good options look like one.
_PUNCT = re.compile(r"[^\w\s+*/^<>=%-]")
_PREFIX = re.compile(r"^\s*(?:[A-Da-d][).:\-]|\([A-Da-d]\)|[1-4][).:])\s+")

# Words too common to be evidence of anything.
_STOP = frozenset("""
a an and are as at be but by for from has have how if in into is it its not of on or
that the their then there these this to use used uses using was were what when which
while will with would you your each other than more most some any all both
""".split())

# Contrastive language — an explanation that teaches says why the *other* option
# fails, and it is very hard to do that without one of these.
_CONTRAST = re.compile(
    r"\b(?:not|isn't|is not|doesn't|does not|cannot|can't|fails?|failing|wrong|incorrect|"
    r"however|whereas|while|but|instead|rather than|unlike|would still|only works|"
    r"tempting|naive|misconception|too slow|breaks?)\b",
    re.IGNORECASE,
)


def _norm(text: str) -> str:
    return _WS.sub(" ", _PUNCT.sub(" ", (text or "").lower())).strip()


def _content_words(text: str) -> set[str]:
    return {w for w in _norm(text).split() if len(w) > 4 and w not in _STOP}


@dataclass
class QualityResult:
    """The verdict on one question."""

    score: int = 5
    explanation_score: int = 5
    flags: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.score >= DEFAULT_MIN_SCORE

    def passes(self, min_score: int = DEFAULT_MIN_SCORE) -> bool:
        return self.score >= min_score


def _as_dict(question: Any) -> dict[str, Any]:
    if hasattr(question, "model_dump"):
        return question.model_dump()
    if isinstance(question, Mapping):
        return dict(question)
    raise TypeError(f"cannot read question of type {type(question)!r}")


def check_question(question: Any) -> QualityResult:
    """Score one MCQ from 1 (drop it) to 5 (ship it), with reasons."""
    q = _as_dict(question)
    stem = str(q.get("question", ""))
    options = [str(o) for o in (q.get("options") or [])]
    explanation = str(q.get("explanation", ""))
    try:
        answer = int(q.get("answer", 0))
    except (TypeError, ValueError):
        answer = 0

    flags: list[str] = []

    if len(_norm(stem)) < 30:
        flags.append("stem-too-short")

    normalised = [_norm(o) for o in options]
    if len(set(normalised)) < len(normalised):
        flags.append("duplicate-options")

    if any(_PREFIX.match(o) for o in options):
        flags.append("option-prefixes")

    if options and 0 <= answer < len(options):
        correct, distractors = options[answer], [o for i, o in enumerate(options) if i != answer]

        # Length tell: the correct option standing well clear of every distractor
        # lets a test-taker pick it without reading a word.
        if distractors:
            correct_len = len(correct)
            other_lens = [len(o) for o in distractors]
            longest_other = max(other_lens)
            median_other = statistics.median(other_lens)
            # Both a *ratio* and an absolute gap have to clear the bar. The ratio
            # alone fires on four terse options where the right one happens to be
            # a few characters longer ("O(log n)" among "O(n)", "O(1)"), which is
            # not a tell anyone could exploit.
            if (correct_len > longest_other
                    and correct_len > 1.6 * median_other
                    and correct_len - longest_other >= 12):
                flags.append("option-length-tell")

        # Answer leakage: wording unique to the correct option showing up in the
        # stem. Words shared with a distractor prove nothing, so they are excluded.
        stem_words = _content_words(stem)
        correct_only = _content_words(correct) - set().union(*(_content_words(d) for d in distractors)) if distractors else _content_words(correct)
        if correct_only:
            leaked = correct_only & stem_words
            if len(leaked) >= 2 or (len(correct_only) <= 2 and leaked):
                flags.append("answer-leakage")
        if len(_norm(correct).split()) >= 3 and _norm(correct) in _norm(stem):
            if "answer-leakage" not in flags:
                flags.append("answer-leakage")

    # The explanation is the whole product — it is what the learner reads after
    # answering, right or wrong — so it gets its own score.
    explanation_flags: list[str] = []
    if len(explanation.strip()) < 120:
        explanation_flags.append("explanation-too-short")
    if not _CONTRAST.search(explanation):
        explanation_flags.append("explanation-asserts-only")
    if options and 0 <= answer < len(options):
        if _norm(explanation) and _norm(options[answer]) and _norm(explanation).strip() == _norm(options[answer]).strip():
            explanation_flags.append("explanation-repeats-option")

    flags.extend(explanation_flags)

    score = 5 - sum(FLAG_PENALTIES.get(f, 1) for f in flags)
    explanation_score = 5 - sum(FLAG_PENALTIES.get(f, 1) for f in explanation_flags)
    return QualityResult(
        score=max(1, min(5, score)),
        explanation_score=max(1, min(5, explanation_score)),
        flags=flags,
    )


def check_set(questions: Sequence[Any]) -> list[str]:
    """Checks that only make sense across a whole batch.

    Returns set-level flags; currently just answer-position bias, which is the
    one bias models reliably fall into and the one a learner exploits fastest.
    """
    flags: list[str] = []
    answers = []
    for item in questions:
        q = _as_dict(item)
        try:
            answers.append(int(q.get("answer", 0)))
        except (TypeError, ValueError):
            continue
    if len(answers) >= 8:
        most_common = max(set(answers), key=answers.count)
        if answers.count(most_common) / len(answers) > 0.55:
            flags.append(f"answer-position-bias:index-{most_common}")
    return flags


@dataclass
class QualityReport:
    """Aggregate outcome of filtering a batch."""

    total: int = 0
    accepted: int = 0
    rejected: int = 0
    flag_counts: dict[str, int] = field(default_factory=dict)
    set_flags: list[str] = field(default_factory=list)

    def summary(self) -> str:
        line = f"quality: {self.accepted}/{self.total} accepted"
        if self.rejected:
            line += f", {self.rejected} rejected"
        if self.flag_counts:
            top = sorted(self.flag_counts.items(), key=lambda kv: -kv[1])[:4]
            line += " · " + ", ".join(f"{k}×{v}" for k, v in top)
        for f in self.set_flags:
            line += f" · {f}"
        return line


def filter_questions(
    questions: Sequence[Any],
    *,
    min_score: int = DEFAULT_MIN_SCORE,
) -> tuple[list[tuple[Any, QualityResult]], QualityReport]:
    """Score a batch and drop anything below `min_score`.

    Returns ``(kept, report)`` where each kept entry pairs the original object
    with its result, so the caller can stamp the scores onto whatever it stores.
    """
    report = QualityReport(total=len(questions), set_flags=check_set(questions))
    kept: list[tuple[Any, QualityResult]] = []
    for item in questions:
        result = check_question(item)
        for f in result.flags:
            report.flag_counts[f] = report.flag_counts.get(f, 0) + 1
        if result.passes(min_score):
            kept.append((item, result))
            report.accepted += 1
        else:
            report.rejected += 1
    return kept, report


# ------------------------------------------------------------------ LLM review
REVIEW_SYSTEM_PROMPT = """You are a strict reviewer for an interview-prep question bank.

For each numbered question you are given, decide whether it is good enough to
show a learner. Judge only these things:

1. Is exactly one option defensibly correct, and is the marked answer that one?
2. Are the three distractors plausible enough that someone who does not know the
   material could pick them?
3. Does the explanation teach the reasoning — including why the most tempting
   wrong option fails — rather than restating the answer?
4. Is the question answerable without having seen the original problem statement?

Reply with one line per question, in order, in exactly this form:
<number>|<accept|reject>|<score 1-5>|<short reason>

No other output."""


def build_review_prompt(questions: Sequence[Any]) -> str:
    """Render a batch into one review message. Batching keeps the pass cheap —
    one call per problem's worth of questions instead of one call each."""
    blocks = []
    for i, item in enumerate(questions, 1):
        q = _as_dict(item)
        options = [str(o) for o in (q.get("options") or [])]
        marked = q.get("answer", 0)
        rendered = "\n".join(
            f"  {j}. {o}{'   <-- marked correct' if j == marked else ''}"
            for j, o in enumerate(options)
        )
        blocks.append(
            f"{i}. {q.get('question', '')}\n{rendered}\n"
            f"  explanation: {q.get('explanation', '')}"
        )
    return "Review these questions.\n\n" + "\n\n".join(blocks)


def parse_review(text: str, count: int) -> list[tuple[bool, int, str]]:
    """Parse the reviewer's lines into ``(accepted, score, reason)`` per question.

    Anything unparseable is treated as an accept: a malformed review is the
    reviewer's failure, and silently deleting good questions over it would be
    worse than shipping one the reviewer disliked.
    """
    out: list[tuple[bool, int, str]] = []
    for line in (text or "").splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3 or not parts[0].rstrip(".").isdigit():
            continue
        verdict = parts[1].lower().startswith("accept")
        try:
            score = max(1, min(5, int(re.sub(r"\D", "", parts[2]) or 5)))
        except ValueError:
            score = 5
        out.append((verdict, score, parts[3] if len(parts) > 3 else ""))
    while len(out) < count:
        out.append((True, 5, "unreviewed"))
    return out[:count]


def review_with_llm(questions: Sequence[Any], *, model: str, provider: str) -> list[tuple[bool, int, str]]:
    """Optional semantic pass. Returns one verdict per question, in order.

    Failures are non-fatal — a review pass that cannot run must not take the
    generation run down with it.
    """
    if not questions:
        return []
    prompt = build_review_prompt(questions)
    try:
        if provider == "anthropic":
            from anthropic import Anthropic

            response = Anthropic().messages.create(
                model=model,
                max_tokens=2000,
                system=REVIEW_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in response.content if getattr(b, "type", "") == "text")
        else:
            from langchain_openai import ChatOpenAI

            text = ChatOpenAI(model=model, temperature=0).invoke(
                [{"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                 {"role": "user", "content": prompt}]
            ).content
    except Exception as e:  # noqa: BLE001 — review is best-effort by design
        print(f"  ! LLM review unavailable ({e}); keeping heuristic scores.")
        return [(True, 5, "review-skipped")] * len(questions)
    return parse_review(str(text), len(questions))
