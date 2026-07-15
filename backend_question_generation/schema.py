"""Pydantic schema for generated multiple-choice questions.

Field descriptions double as instructions to the LLM's structured-output
parser, so keep them precise.
"""
from pydantic import BaseModel, Field, field_validator


class MCQ(BaseModel):
    leetQuestionId: int = Field(description="The numeric id of the source LeetCode problem.")
    questionId: str = Field(description="Unique id: the leetQuestionId followed by a letter, e.g. '1A', '1B'.")
    title: str = Field(description="A short, descriptive title for this specific question.")
    topics: list[str] = Field(description="1-4 topic tags, e.g. ['Hash Table', 'Array'].")
    category: str = Field(default="Algorithms", description="The primary study bucket used by the app's topic picker, e.g. 'Arrays & Hashing', 'Two Pointers', 'Graphs'. Derived from the source problem's curated-list category.")
    lists: list[str] = Field(default_factory=list, description="Curated lists this question belongs to, e.g. ['neetcode150'].")
    source: str = Field(default="llm", description="How this MCQ was produced: 'llm' or 'mock'.")
    difficulty: str = Field(description="One of 'Easy', 'Medium', or 'Hard'.")
    question: str = Field(description="A standalone, conceptual question that does not require seeing the original problem statement.")
    options: list[str] = Field(description="Exactly four answer choices. No 'A)'/'B)' prefixes.")
    answer: int = Field(description="Index (0-3) of the single correct option in `options`.")
    explanation: str = Field(description="Concise reasoning for why the correct option is right, focused on the algorithmic insight.")

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
