"""Duplicate detection for generated questions.

The scheduled top-up job re-runs every few hours against the same pool of source
problems, so without this module the deck slowly fills with the same question
asked twice. Two levels of matching:

* **exact**  — a content hash over the normalised stem + options. Option order
  is ignored, so a reshuffled copy still collides.
* **near**   — a similarity ratio over the same normalised text, for the common
  case where the model rewords a question it has already written.

Scope matters. Two questions about *different* problems that happen to share a
stem ("What is the time complexity of the optimal approach?") are not
duplicates — they teach different material and the app shows them in different
decks. So matching is scoped to one `sourceSlug` by default; cross-problem
collisions are reported but kept unless `scope="global"` is requested.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Iterable, Mapping, Sequence

# Near-duplicate cutoff. 0.95 is deliberately strict: below it, questions that
# merely share a template ("Which data structure ...") start matching.
DEFAULT_THRESHOLD = 0.95

# Jaccard prefilter cutoff. SequenceMatcher is O(n^2) in the text length, so we
# only pay for it on pairs that already share most of their vocabulary.
_PREFILTER = 0.5

_WS = re.compile(r"\s+")
# Decoration only. Operators stay: "O(m + n)" and "O(m * n)" are different
# answers, and collapsing them would let dedupe delete a legitimate question.
_PUNCT = re.compile(r"[^\w\s+*/^<>=%-]")


def _norm(text: str) -> str:
    """Lowercase, drop decoration, collapse whitespace.

    Reduces "What is the *time* complexity?" and "what is the time complexity"
    to the same string so cosmetic edits don't defeat matching.
    """
    return _WS.sub(" ", _PUNCT.sub(" ", (text or "").lower())).strip()


def _fingerprint(question: Mapping[str, Any]) -> str:
    """The canonical text a question is identified by: stem + sorted options.

    Options are sorted so that reordering them (which the model does freely)
    produces the same fingerprint. The answer index is deliberately excluded —
    the same stem with the same choices is a duplicate regardless of which one
    was marked correct, and if the index differs one of them is simply wrong.
    """
    stem = _norm(str(question.get("question", "")))
    options = sorted(_norm(str(o)) for o in question.get("options", []) or [])
    return stem + "||" + "|".join(options)


def question_hash(question: Mapping[str, Any]) -> str:
    """Stable content hash. Equal hashes mean an exact duplicate."""
    return hashlib.md5(_fingerprint(question).encode("utf-8")).hexdigest()


def _tokens(fingerprint: str) -> frozenset[str]:
    return frozenset(fingerprint.split())


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def similarity_score(a: Mapping[str, Any], b: Mapping[str, Any]) -> float:
    """How alike two questions are, from 0.0 (unrelated) to 1.0 (identical)."""
    fa, fb = _fingerprint(a), _fingerprint(b)
    if fa == fb:
        return 1.0
    if _jaccard(_tokens(fa), _tokens(fb)) < _PREFILTER:
        return 0.0  # cheap reject — cannot reach the threshold
    return SequenceMatcher(None, fa, fb).ratio()


@dataclass
class DedupeReport:
    """What `deduplicate` threw away and why."""

    kept: int = 0
    exact_duplicates: int = 0
    near_duplicates: int = 0
    id_collisions: int = 0
    cross_problem_matches: int = 0
    # (questionId, reason, matched-against questionId)
    dropped: list[tuple[str, str, str]] = field(default_factory=list)

    @property
    def removed(self) -> int:
        return len(self.dropped)

    def summary(self) -> str:
        parts = [f"kept {self.kept}"]
        if self.exact_duplicates:
            parts.append(f"{self.exact_duplicates} exact")
        if self.near_duplicates:
            parts.append(f"{self.near_duplicates} near")
        if self.id_collisions:
            parts.append(f"{self.id_collisions} id collision(s)")
        line = "dedupe: " + ", ".join(parts)
        if self.cross_problem_matches:
            line += (f" · note: {self.cross_problem_matches} identical stem(s) across "
                     f"different problems (kept)")
        return line


def _as_dict(question: Any) -> dict[str, Any]:
    """Accept either plain dicts or pydantic models."""
    if hasattr(question, "model_dump"):
        return question.model_dump()
    if isinstance(question, Mapping):
        return dict(question)
    raise TypeError(f"cannot read question of type {type(question)!r}")


def deduplicate(
    questions: Sequence[Any],
    existing: Iterable[Any] = (),
    *,
    threshold: float = DEFAULT_THRESHOLD,
    scope: str = "problem",
) -> tuple[list[Any], DedupeReport]:
    """Drop questions that repeat something already present.

    Args:
        questions: candidates, in priority order — earlier ones win a tie.
        existing: questions already in the deck/DB. Candidates are checked
            against these as well as against each other.
        threshold: similarity at or above which a pair counts as a duplicate.
        scope: ``"problem"`` compares only within a `sourceSlug` (the default,
            and what you want for a deck that spans many problems);
            ``"global"`` compares everything against everything.

    Returns:
        ``(kept, report)`` where *kept* holds the original objects — pydantic
        models stay models — in their input order.
    """
    if scope not in {"problem", "global"}:
        raise ValueError("scope must be 'problem' or 'global'")

    report = DedupeReport()

    # Buckets keyed by comparison scope. Each holds (hash, fingerprint-tokens,
    # dict, questionId) for everything accepted so far.
    buckets: dict[str, list[tuple[str, frozenset[str], dict, str]]] = {}
    hashes_by_key: dict[str, dict[str, str]] = {}
    seen_ids: set[str] = set()
    # Every hash seen anywhere, for the cross-problem note.
    global_hashes: dict[str, str] = {}

    def key_for(q: dict) -> str:
        return "" if scope == "global" else str(q.get("sourceSlug") or q.get("leetQuestionId") or "")

    def admit(q: dict, qid: str) -> None:
        k = key_for(q)
        h = question_hash(q)
        buckets.setdefault(k, []).append((h, _tokens(_fingerprint(q)), q, qid))
        hashes_by_key.setdefault(k, {})[h] = qid
        global_hashes.setdefault(h, qid)
        if qid:
            seen_ids.add(qid)

    for item in existing:
        d = _as_dict(item)
        admit(d, str(d.get("questionId", "")))

    kept: list[Any] = []
    for item in questions:
        d = _as_dict(item)
        qid = str(d.get("questionId", ""))
        k = key_for(d)
        h = question_hash(d)

        prior = hashes_by_key.get(k, {}).get(h)
        if prior is not None:
            report.exact_duplicates += 1
            report.dropped.append((qid, "exact", prior))
            continue

        if qid and qid in seen_ids:
            # Same id, different content: the id is unusable even though the
            # question may be fine. Dropping is safer than silently shadowing
            # the existing row on upsert.
            report.id_collisions += 1
            report.dropped.append((qid, "id-collision", qid))
            continue

        match_id = None
        cand_tokens = _tokens(_fingerprint(d))
        for other_h, other_tokens, other, other_id in buckets.get(k, ()):
            if _jaccard(cand_tokens, other_tokens) < _PREFILTER:
                continue
            if similarity_score(d, other) >= threshold:
                match_id = other_id
                break
        if match_id is not None:
            report.near_duplicates += 1
            report.dropped.append((qid, "near", match_id))
            continue

        if scope == "problem" and h in global_hashes:
            report.cross_problem_matches += 1

        admit(d, qid)
        kept.append(item)

    report.kept = len(kept)
    return kept, report


def find_duplicates(
    questions: Sequence[Any],
    *,
    threshold: float = DEFAULT_THRESHOLD,
    scope: str = "problem",
) -> list[tuple[str, str, float]]:
    """Audit an existing deck without modifying it.

    Returns ``(questionId, duplicate-of-questionId, score)`` for every pair that
    would be collapsed. An empty list means the deck is clean.
    """
    # Feed the deck in as *candidates* (not `existing`, which is trusted as-is)
    # so every row is scored against the ones before it.
    _, report = deduplicate(list(questions), (), threshold=threshold, scope=scope)
    by_id = {str(_as_dict(q).get("questionId", "")): _as_dict(q) for q in questions}
    out: list[tuple[str, str, float]] = []
    for qid, reason, other_id in report.dropped:
        if reason == "id-collision":
            out.append((qid, other_id, 1.0))
            continue
        a, b = by_id.get(qid), by_id.get(other_id)
        out.append((qid, other_id, similarity_score(a, b) if a and b else 1.0))
    return out
