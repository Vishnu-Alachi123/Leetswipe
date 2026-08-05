"""Pydantic schemas for everything the generator produces.

Two layers, and the split matters:

* **Generation models** (`MCQ`/`MCQSet`, `CodeQuestion`, `AlgorithmReel`) are the
  contract handed to the LLM's structured-output parser. Field descriptions are
  read by the model, so keep them precise — and keep the models lean, because
  every optional field is one more thing the model can waste tokens guessing at.
* **Storage models** (`StoredMCQ`) add pipeline-owned metadata — timestamps,
  content hash, quality scores — that the LLM must never be asked to fill in.

The app reads whichever fields it knows about and ignores the rest, so adding to
the storage layer is backwards-compatible with decks already shipped.
"""
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MCQ(BaseModel):
    leetQuestionId: int = Field(description="The numeric id of the source LeetCode problem.")
    questionId: str = Field(description="Unique id: the leetQuestionId followed by a letter, e.g. '1A', '1B'.")
    title: str = Field(description="A short, descriptive title for this specific question.")
    topics: list[str] = Field(description="1-4 topic tags, e.g. ['Hash Table', 'Array'].")
    category: str = Field(default="Algorithms", description="The primary study bucket used by the app's topic picker, e.g. 'Arrays & Hashing', 'Two Pointers', 'Graphs'. Derived from the source problem's curated-list category.")
    lists: list[str] = Field(default_factory=list, description="Curated lists this question belongs to, e.g. ['neetcode150'].")
    source: str = Field(default="llm", description="How this MCQ was produced: 'llm' or 'mock'.")
    sourceSlug: str = Field(default="", description="LeetCode slug of the source problem, e.g. 'two-sum'. Set by the pipeline, not the LLM.")
    difficulty: str = Field(description="One of 'Easy', 'Medium', or 'Hard'.")
    question: str = Field(description="A standalone, conceptual question that does not require seeing the original problem statement.")
    options: list[str] = Field(description="Exactly four answer choices. No 'A)'/'B)' prefixes.")
    answer: int = Field(description="Index (0-3) of the single correct option in `options`.")
    explanation: str = Field(description="Concise reasoning for why the correct option is right, focused on the algorithmic insight.")
    visual: dict | None = Field(
        default=None,
        description=(
            "Optional diagram shown above the options, when a picture genuinely helps the "
            "question (an array being scanned, a comparison table). Omit it otherwise. Format: "
            "{'kind': 'array'|'table'|'tree'|'graph'|'queue', 'state': {...}, 'caption': str}. "
            "array/queue state: {'cells': [{'value': 3, 'label': 'i', 'status': "
            "'normal'|'active'|'visited'|'eliminated'}]}. table state: {'columns': [...], 'rows': "
            "[[...]]}. tree/graph state: {'nodes': [{'id','value','status'}], 'edges': "
            "[{'from','to'}]}. The visual must NOT reveal the answer — it sets up the question."
        ),
    )

    @field_validator("difficulty")
    @classmethod
    def _norm_difficulty(cls, v: str) -> str:
        v = (v or "").strip().capitalize()
        return v if v in {"Easy", "Medium", "Hard"} else "Medium"

    @field_validator("options")
    @classmethod
    def _four_options(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError("Each MCQ must have exactly four options.")
        return [o.strip() for o in v]

    @field_validator("answer")
    @classmethod
    def _answer_in_range(cls, v: int) -> int:
        if not 0 <= v <= 3:
            raise ValueError("answer must be an index between 0 and 3.")
        return v


class MCQSet(BaseModel):
    questions: list[MCQ] = Field(default_factory=list)


# --------------------------------------------------------------- storage layer
class StoredMCQ(MCQ):
    """An MCQ plus the provenance the pipeline stamps on after generation.

    Never hand this to a structured-output call — the extra fields would become
    the model's problem instead of the pipeline's.
    """

    type: Literal["mcq"] = "mcq"
    generatedAt: str = Field(default_factory=lambda: _utcnow().isoformat())
    contentHash: str = Field(default="", description="Fingerprint used for duplicate detection.")
    qualityScore: int = Field(default=5, ge=1, le=5, description="Overall question quality, 1 (reject) to 5 (ship).")
    explanationQuality: int = Field(default=5, ge=1, le=5, description="How well the explanation teaches, 1 to 5.")
    qualityFlags: list[str] = Field(default_factory=list, description="Machine-readable reasons the score was docked.")

    @classmethod
    def from_mcq(cls, mcq: MCQ, **meta: Any) -> "StoredMCQ":
        return cls(**mcq.model_dump(), **meta)


# ------------------------------------------------------------- code challenges
class TestCase(BaseModel):
    """One input/output pair a submission is graded against."""

    input: str = Field(description="Arguments as they would be passed to the function, e.g. '[2,7,11,15], 9'.")
    expectedOutput: str = Field(description="The exact value the function must return, serialised, e.g. '[0,1]'.")
    explanation: str = Field(default="", description="Why this case matters, e.g. 'duplicate values'. Shown only after a failure.")
    hidden: bool = Field(default=False, description="True for cases withheld until submission, so the deck cannot be gamed.")


class CodeQuestion(BaseModel):
    """A write-the-code problem, graded by executing it against `testCases`."""

    type: Literal["code"] = "code"
    questionId: str = Field(description="Unique id, e.g. 'two-sum-py'.")
    leetQuestionId: int = Field(default=0, description="Numeric id of the source LeetCode problem, 0 if unknown.")
    title: str = Field(description="Problem title, e.g. 'Two Sum'.")
    problemStatement: str = Field(description="Self-contained statement: what to compute, the input/output contract, and constraints.")
    language: Literal["python", "javascript"] = Field(description="Language the starter code and solution are written in.")
    starterCode: str = Field(description="Runnable skeleton with the signature filled in and the body left as a TODO comment.")
    solution: str = Field(description="A correct, idiomatic reference implementation that passes every test case.")
    testCases: list[TestCase] = Field(description="3-5 cases covering the happy path, an edge case, and a boundary.")
    hints: list[str] = Field(description="Exactly three hints, escalating from a nudge toward the approach to a near-solution.")
    explanation: str = Field(description="Walkthrough of the reference solution and why it is optimal.")
    difficulty: str = Field(description="One of 'Easy', 'Medium', or 'Hard'.")
    topics: list[str] = Field(default_factory=list, description="1-4 topic tags.")
    category: str = Field(default="Algorithms", description="Study bucket used by the app's topic picker.")
    lists: list[str] = Field(default_factory=list)
    sourceSlug: str = Field(default="", description="LeetCode slug. Set by the pipeline, not the LLM.")
    timeEstimate: int = Field(default=10, ge=1, description="Minutes a prepared candidate needs.")
    timeComplexity: str = Field(default="", description="Big-O of the reference solution, e.g. 'O(n)'.")
    spaceComplexity: str = Field(default="", description="Auxiliary space of the reference solution, e.g. 'O(n)'.")
    source: str = Field(default="llm")
    generatedAt: str = Field(default_factory=lambda: _utcnow().isoformat())
    qualityScore: int = Field(default=5, ge=1, le=5)

    _norm_difficulty = field_validator("difficulty")(MCQ._norm_difficulty.__func__)  # type: ignore[attr-defined]

    @field_validator("hints")
    @classmethod
    def _three_hints(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 3:
            raise ValueError("Provide between one and three hints.")
        return [h.strip() for h in v if h.strip()]

    @field_validator("testCases")
    @classmethod
    def _at_least_one_case(cls, v: list[TestCase]) -> list[TestCase]:
        if not v:
            raise ValueError("A code question needs at least one test case.")
        return v


class CodeQuestionSet(BaseModel):
    questions: list[CodeQuestion] = Field(default_factory=list)


# ------------------------------------------------------------- algorithm reels
class Visualization(BaseModel):
    """The data-structure snapshot rendered beside one step of a reel.

    `state` is intentionally loose: an array step ships a list of cells, a tree
    step ships nodes and edges. The renderer switches on `kind`, so pinning the
    shape here would only fight the model for no gain.
    """

    kind: Literal["array", "matrix", "tree", "graph", "stack", "queue", "linkedlist", "table", "none"] = Field(
        description="Which renderer draws this step."
    )
    state: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Renderer payload. array/stack/queue: {'cells': [{'value': 3, 'label': 'i', "
            "'status': 'active|visited|done|normal'}]}. tree/graph: {'nodes': [{'id','value','status'}], "
            "'edges': [{'from','to','status'}]}. table: {'columns': [...], 'rows': [[...]]}."
        ),
    )
    caption: str = Field(default="", description="One short line naming what changed in this step.")


class ReelStep(BaseModel):
    """One beat of an algorithm walkthrough: a line or two of code, what it did,
    and the narration read over it."""

    stepNumber: int = Field(ge=1, description="1-based position in the reel.")
    code: str = Field(description="The 1-3 lines of code this step executes. Not the whole program.")
    highlightLines: list[int] = Field(default_factory=list, description="1-based line numbers to highlight within the full listing.")
    explanation: str = Field(description="One or two sentences on what this line does to the data.")
    audioScript: str = Field(description="40-90 words of conversational narration. Spoken aloud, so no symbols or code syntax — say 'i plus one', not 'i+1'.")
    visualization: Visualization = Field(description="State of the data structure *after* this step runs.")


class AlgorithmReel(BaseModel):
    """A short, scrollable walkthrough of one algorithm, step by step."""

    type: Literal["reel"] = "reel"
    reelId: str = Field(description="Unique id, e.g. 'binary-search-py'.")
    algorithmName: str = Field(description="Name of the technique, e.g. 'Binary Search', 'Kadane's Algorithm'.")
    description: str = Field(description="One or two sentences: what problem this solves and when to reach for it.")
    hook: str = Field(default="", description="A single scroll-stopping line shown on the cover card, e.g. 'Find any item in 4 million in 22 steps.'")
    language: Literal["python", "javascript"] = Field(default="python")
    fullCode: str = Field(description="The complete implementation the steps walk through, so line highlights line up.")
    steps: list[ReelStep] = Field(description="5-8 steps. Each must change the visualisation — no filler.")
    difficulty: str = Field(description="One of 'Easy', 'Medium', or 'Hard'.")
    topics: list[str] = Field(default_factory=list)
    category: str = Field(default="Algorithms")
    lists: list[str] = Field(default_factory=list)
    sourceSlug: str = Field(default="")
    timeComplexity: str = Field(default="")
    spaceComplexity: str = Field(default="")
    durationSeconds: int = Field(default=0, description="Estimated playback length. Filled in by the pipeline from the audio scripts.")
    source: str = Field(default="llm")
    generatedAt: str = Field(default_factory=lambda: _utcnow().isoformat())

    _norm_difficulty = field_validator("difficulty")(MCQ._norm_difficulty.__func__)  # type: ignore[attr-defined]

    @field_validator("steps")
    @classmethod
    def _has_steps(cls, v: list[ReelStep]) -> list[ReelStep]:
        if len(v) < 2:
            raise ValueError("A reel needs at least two steps.")
        return v


class ReelSet(BaseModel):
    reels: list[AlgorithmReel] = Field(default_factory=list)
