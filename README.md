# LeetSwipe

A swipe-style app for practicing LeetCode problems — think Tinder, but for coding
interview questions. Swipe through auto-generated multiple-choice questions that
teach the *reasoning* behind each problem, save the ones worth revisiting, and pull
fresh questions on demand.

## Stack
- **Frontend:** React Native / Expo (`LeetSwipe/`) — swipe UI (in progress)
- **Backend:** Python MCQ-generation pipeline (`backend_question_generation/`)
- **Data:** MongoDB Atlas; LeetCode question extraction (`leetcode_q_extractor.ts`)

## Question generation (`backend_question_generation/`)

The generator turns a LeetCode problem into a set of standalone conceptual MCQs
with strong distractors, difficulty, topic tags, and explanations. It uses
**structured output** (`schema.py`) so results are always valid and parseable.

| File | Purpose |
|------|---------|
| `generate.py` | CLI entry point — the whole pipeline |
| `schema.py` | Pydantic models for a validated MCQ / MCQ set |
| `prompts.py` | System prompt + per-problem user prompt |
| `quickstart.py` | MongoDB read/write (idempotent upsert by `questionId`) |

### Two generation paths
- **OpenAI (production):** structured output via LangChain + `gpt-4o-mini`. Needs
  `OPENAI_API_KEY`. Prompts were rewritten to enforce standalone questions, exactly
  four options with one correct answer, plausible misconception-based distractors,
  varied correct-answer positions, calibrated difficulty, and concise explanations.
- **`--mock` (offline):** a deterministic, metadata-driven generator that needs no
  API key. It exists so the pipeline is runnable and testable end-to-end offline;
  it is not a quality substitute for the LLM.

### Usage
```bash
cd backend_question_generation
python -m venv venv && source venv/bin/activate
pip install langchain langchain-openai openai pymongo python-dotenv pydantic

# Offline test — no keys, writes JSON:
python generate.py --input ../leetData.json --mock --dry-run --out out.json

# Real generation to a file (needs OPENAI_API_KEY in .env):
python generate.py --input ../leetData.json --num 5 --dry-run --out out.json

# Load problems from Mongo and write MCQs back (needs OPENAI_API_KEY + MONGODB_KEY):
python generate.py --from-db --num 5
```

`.env` (git-ignored) holds `OPENAI_API_KEY` and `MONGODB_KEY`.

## Status / next steps
- ✅ Backend MCQ pipeline: working, validated, offline-testable, documented.
- 🚧 Frontend: the Expo app is scaffolded; the swipe UI still needs to be wired to
  the generated-questions collection (`api/get-questions.tsx` is a stub).
