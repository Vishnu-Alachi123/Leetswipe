# LeetSwipe

A swipe-style app for practicing LeetCode problems — think Tinder, but for coding
interview questions. Swipe through auto-generated multiple-choice questions that
teach the *reasoning* behind each problem, save the ones worth revisiting, and pull
fresh questions on demand.

**▶ Live web demo:** https://vishnu-alachi123.github.io/Leetswipe/ (works on mobile too)
**📱 Run on your phone:** see [`LeetSwipe/MOBILE.md`](LeetSwipe/MOBILE.md) (Expo Go / EAS Build)

## Stack
- **Frontend:** React Native / Expo (`LeetSwipe/`) — swipe UI, runs on iOS, Android, and web
- **Backend:** Python MCQ-generation pipeline (`backend_question_generation/`)
- **Data:** MongoDB Atlas; LeetCode question extraction (`leetcode_q_extractor.ts`)
- **CI/CD:** GitHub Actions auto-builds the web export and deploys to GitHub Pages
  on every push to `main` (`.github/workflows/deploy-web.yml`)

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

## Frontend (`LeetSwipe/`)

An Expo / React Native app with a working swipe deck:

- **Swipe tab** (`app/(tabs)/index.tsx`) — a card stack built on `Animated` +
  `PanResponder` (no extra gesture deps). Swipe right / **Save** to keep a
  question, swipe left / **Skip** to pass. Tap an option to check your answer;
  the correct choice and the explanation are revealed inline. A running progress
  and saved count are shown, and finishing the deck gives a summary of everything
  you saved.
- **About tab** (`app/(tabs)/explore.tsx`) — how it works and how to plug in live
  questions.
- **Data layer** (`api/get-questions.tsx`) — a React-Native-safe loader typed to
  the backend's `schema.MCQ`. It bundles a sample deck (`assets/data/questions.json`)
  so the app runs with zero setup, and will fetch from `EXPO_PUBLIC_QUESTIONS_URL`
  when set (an HTTP endpoint returning `{ questions: MCQ[] }`). MongoDB is never
  queried from the client — put it behind that endpoint.

```bash
cd LeetSwipe
npm install
npx expo start        # then press w for web, or scan the QR for a device
npx tsc --noEmit      # typecheck
```

## Status / next steps
- ✅ Backend MCQ pipeline: working, validated, offline-testable, documented.
- ✅ Frontend swipe UI: card deck, answer-checking, save/skip, saved summary,
  bundled sample deck, typechecks clean.
- 🚧 Next: a thin HTTP endpoint in front of the `GeneratedQuestionsCollection`
  so the app can pull live questions, plus persisting saved questions across
  sessions.
