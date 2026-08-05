# LeetSwipe

Interview practice in three formats, all of which work offline:

- **Swipe** — auto-generated multiple-choice questions that teach the *reasoning*
  behind each problem, with an explanation shown whether you were right or wrong.
- **Learn** — algorithm walkthroughs that step through code one line at a time,
  showing what each line does to the data structure, with optional narration.
- **Write** — code challenges graded on the device against real test cases.

**▶ Live web demo:** https://vishnu-alachi123.github.io/Leetswipe/ (works on mobile too)
**📱 Run on your phone:** see [`LeetSwipe/MOBILE.md`](LeetSwipe/MOBILE.md) (Expo Go / EAS Build)

## Stack
- **Frontend:** React Native / Expo (`LeetSwipe/`) — topic picker, swipe deck, Learn
  feed, code challenges, saved library; runs on iOS, Android, and web
- **API:** TypeScript / Express (`server/`) — serves questions by topic/difficulty/list
  and stores per-user saved questions; the client never touches MongoDB directly
- **Generator:** Python MCQ-generation pipeline (`backend_question_generation/`)
- **Data:** MongoDB Atlas; LeetCode question extraction (`leetcode_q_extractor.ts`);
  NeetCode-150 category map (`backend_question_generation/lists/neetcode150.json`)
- **CI/CD:** GitHub Actions auto-builds the web export and deploys to GitHub Pages
  (`.github/workflows/deploy-web.yml`), plus a scheduled question top-up job
  (`.github/workflows/generate-questions.yml`)

## Question generation (`backend_question_generation/`)

The generator turns a LeetCode problem into a set of standalone conceptual MCQs
with strong distractors, difficulty, topic tags, and explanations. It uses
**structured output** (`schema.py`) so results are always valid and parseable.

| File | Purpose |
|------|---------|
| `generate.py` | CLI entry point — the whole pipeline |
| `schema.py` | Pydantic models for MCQs, code questions, and reels |
| `prompts.py` | System prompt + per-problem user prompt |
| `deduplication.py` | Exact and near-duplicate detection, so re-runs never repeat |
| `quality.py` | Offline quality gate — answer leakage, option tells, weak explanations |
| `quickstart.py` | MongoDB read/write (idempotent upsert by `questionId`) |
| `generate_reels.py` | Algorithm walkthrough generation + validation |
| `seed_reels.py` | Builds the curated reels that ship with the app |
| `code_executor.py` | Judge0 wrapper (for languages the device cannot run) |

**How the deck grows without repeating itself** —
[`GENERATION.md`](backend_question_generation/GENERATION.md) documents the
duplicate and quality gates, the top-up rotation, and why a scheduled run costs
nothing once every problem hits its target.

### Three generation paths
- **Anthropic (preferred):** structured output via the official `anthropic` SDK
  (`messages.parse()` validated against the Pydantic schema, adaptive thinking on).
  Needs `ANTHROPIC_API_KEY`. Default model `claude-opus-4-8`; pass
  `--model claude-haiku-4-5` for a ~5x cheaper run.
- **OpenAI:** structured output via LangChain + `gpt-4o-mini`. Needs `OPENAI_API_KEY`.
- **`--mock` (offline):** a deterministic, metadata-driven generator that needs no
  API key — for testing the pipeline end-to-end, not a quality substitute.

The provider is auto-selected from whichever key is set (`--provider` to force).
Prompts enforce standalone questions, exactly four options with one correct answer,
misconception-based distractors, varied correct-answer positions, calibrated
difficulty, and explanations that also say why the tempting distractor fails.

### Problem sources
- `--neetcode` — seed from the checked-in NeetCode-150 map
  (`lists/neetcode150.json`): all 150 problems, tagged by category and difficulty,
  no LeetCode scrape or database needed. The model generates from its own knowledge
  of these canonical problems.
- `--input file.json` — problems extracted by `leetcode_q_extractor.ts`.
- `--from-db` — problems stored in MongoDB.

### Usage
```bash
cd backend_question_generation
python -m venv venv && source venv/bin/activate
pip install anthropic langchain langchain-openai openai pymongo python-dotenv pydantic
cp .env.example .env   # fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)

# Offline test — no keys, writes JSON:
python generate.py --neetcode --mock --dry-run --out out.json

# Fill the app's bundled deck from all 150 NeetCode problems (no DB needed);
# committing the result auto-deploys the web app with the new deck:
python generate.py --neetcode --dry-run --out out.json \
  --app-out ../LeetSwipe/assets/data/questions.json

# Fill / top up MongoDB (idempotent — skips already-stocked problems):
python generate.py --neetcode --fill --num 3
```

`.env` (git-ignored) holds `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` and `MONGODB_KEY`.
The scheduled workflow (`.github/workflows/generate-questions.yml`) runs the DB
top-up every 6 hours and can also regenerate the bundled deck on demand — set the
same names as repository secrets.

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

## API (`server/`)

A thin TypeScript/Express service between the app and MongoDB. Serves
`GET /topics`, `GET /questions?category=&difficulty=&list=&exclude=`, issues
anonymous JWTs (`POST /auth/anon`), and stores per-user saved questions
(`GET/POST/DELETE /saved`). Run it with `cd server && npm install && npm run dev`,
then set `EXPO_PUBLIC_API_URL` in the app. See `server/README.md`.

## Status / next steps
- ✅ Backend MCQ pipeline: working, validated, offline-testable; questions tagged by
  category + curated list; `--fill` top-up mode + scheduled workflow.
- ✅ API server: topic/difficulty/list filtering, anonymous auth, saved-question sync.
- ✅ Frontend: topic/list/difficulty picker, filtered swipe deck, persistent Saved
  tab with sort/filter, streak + "seen" tracking, haptics. Typechecks clean; web
  export builds.
- 🚧 Next: deploy the API to a host and set `EXPO_PUBLIC_API_URL`; run the generator
  with an OpenAI key to fill the bank; submit to the stores once dev accounts exist.
