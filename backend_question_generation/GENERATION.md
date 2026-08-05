# How content generation stays clean

This describes the guarantees the pipeline makes about the deck: that it grows,
that it never repeats itself, and that runs stop spending money once there is
nothing left to add. [Algorithm reels](#algorithm-reels) follow the same rules
with their own validator.

## The bug this replaced

The scheduled job used to run:

```
python generate.py --neetcode --dry-run --num 3 --limit 40 \
  --app-out ../LeetSwipe/assets/data/questions.json
```

Two things went wrong every six hours:

1. **`--app-out` overwrote the deck.** A run touching 40 of 150 problems wrote a
   file containing only those 40 problems' questions. A 450-question deck came
   back as ~120, and the other 110 problems vanished.
2. **`--limit 40` always took the *same* first 40 problems.** There was no
   rotation, so every run re-asked the model for questions it had already
   written, burned tokens on near-identical output, and never reached problem 41.

So: API spend went up, the deck did not grow, and what it did contain churned.

## What happens now

```
python generate.py --neetcode --dry-run --fill --fill-source bundle \
  --num 3 --limit 40 --min-per-problem 6 \
  --app-out ../LeetSwipe/assets/data/questions.json
```

### 1. Stock is read before anything is generated

`--fill --fill-source bundle` reads the committed deck and counts questions per
`sourceSlug`. Problems already at `--min-per-problem` are dropped from the run
entirely — no API call is made for them.

### 2. Problems are processed thinnest-first

The remaining problems are sorted by current stock ascending, so a `--limit 40`
run works on the 40 most under-served problems. The next run picks up where this
one left off. That is the rotation the old job lacked.

### 3. New ids continue the series

`_stamp` offsets ids by existing stock, so topping up `two-sum` from 3 to 6
produces `two-sum-4`, `two-sum-5`, `two-sum-6` — not a second `two-sum-1`.

### 4. Every question passes a quality gate

`quality.py` scores each question 1-5 and drops anything below `--min-quality`
(default 3). The checks are heuristics, so they run offline, for free, and are
unit-tested:

| Flag | What it catches | Penalty |
|---|---|---|
| `duplicate-options` | two options that mean the same thing — really a 3-way choice | −3 |
| `answer-leakage` | wording unique to the correct option echoed in the stem | −3 |
| `option-length-tell` | the correct option visibly longest, guessable without reading | −2 |
| `stem-too-short` | question too thin to answer | −2 |
| `option-prefixes` | literal `A)` / `B)` baked into the option text | −1 |
| `explanation-too-short` | under ~120 characters | −1 |
| `explanation-asserts-only` | states the answer without saying why the runner-up fails | −1 |

There is also a set-level check for **answer-position bias** — a model that puts
the correct answer at index 0 sixty percent of the time hands the learner a free
strategy.

`--llm-review` adds a semantic pass on top (one batched call per problem). It is
opt-in because it roughly doubles cost, and a review failure is non-fatal by
design: a broken reviewer must not delete good questions.

### 5. Every question passes a duplicate gate

`deduplication.py` compares each candidate against the whole existing deck *and*
against the others in the same batch:

- **Exact** — an MD5 over the normalised stem plus *sorted* options. Reordering
  the choices, changing case, or restyling punctuation does not evade it.
- **Near** — a similarity ratio ≥ 0.95 over the same text, for the case where
  the model rewords something it has already written. A cheap token-overlap
  prefilter runs first so the expensive comparison only happens on plausible
  pairs.
- **Id collision** — same `questionId`, different content. Dropped, because
  writing it would silently shadow the existing row on upsert.

#### Scoping, and why it matters

Matching is scoped to one `sourceSlug` by default. Two *different* problems may
legitimately both ask "what is the time complexity of the optimal approach?" —
they appear in different decks and teach different material, so collapsing them
would lose a real question. Cross-problem collisions are counted and reported,
not removed. Pass `--dedupe-scope global` if you want them gone.

> **Normalisation keeps math operators.** An earlier version stripped all
> punctuation, which made `O(m + n)` and `O(m * n)` identical — enough to mark a
> valid four-option question as having duplicate options, and enough for dedupe
> to delete a legitimate question. Both modules now preserve `+ * / ^ < > = % -`.
> There are regression tests for this in both test files.

### 6. The deck is merged, never replaced

`write_app_deck` writes `existing + new` and prints the arithmetic:

```
Wrote app deck to ...: 450 existing + 87 new = 537 questions.
```

`--app-replace` restores the old overwrite behaviour, for when you genuinely
want to start over.

### 7. Runs go quiet when there is nothing to do

Once every problem has `--min-per-problem` questions, the run exits 0 with:

```
Nothing to top up: every problem already has >= 6 questions.
Raise --min-per-problem to grow the deck.
```

No API call, no commit, no red X on the Actions tab. **To grow the deck, raise
`min_per_problem`** — it is a workflow input, so you can bump it from the Actions
UI without editing anything.

## Verifying the guarantees yourself

```bash
cd backend_question_generation
python -m pytest tests/ -q          # 95 tests, no network, no API key

# audit the shipped deck for duplicates
python -c "
import json
from deduplication import find_duplicates
deck = json.load(open('../LeetSwipe/assets/data/questions.json'))['questions']
print('duplicates:', len(find_duplicates(deck)))
"

# see the quality distribution
python -c "
import json
from quality import filter_questions
deck = json.load(open('../LeetSwipe/assets/data/questions.json'))['questions']
print(filter_questions(deck)[1].summary())
"
```

Current state of the shipped 450-question deck: **0 duplicates**, 430/450 passing
the quality gate.

## Algorithm reels

Reels are the Learn tab's step-by-step walkthroughs. `generate_reels.py` follows
the same merge/fill/validate shape as the question pipeline:

```bash
# offline check of the whole path
python generate_reels.py --mock --limit 3 --out /tmp/reels.json

# top up the shipped set, skipping algorithms already covered
python generate_reels.py --fill --limit 4 --out ../LeetSwipe/assets/data/reels.json
```

`--fill` skips any algorithm already present by name, so the 25-entry catalog is
worked through a few at a time and re-runs cost nothing once it is exhausted.

### Why reels need their own validator

A reel can satisfy the schema completely and still be broken on screen. The
checks in `validate_reel` cover the failures that actually happen:

| Check | What goes wrong without it |
|---|---|
| highlight lines within the listing | a step lights up line 12 of an 8-line program, so nothing highlights |
| consecutive steps must differ | the learner taps Next and the picture does not move |
| narration 20-130 words | a step is over before the sentence lands, or drones on |
| no code syntax in narration | the speech engine reads "open bracket zero close bracket" aloud |
| steps numbered 1..n | the progress bar desynchronises from the content |

These caught two real bugs in the *hand-authored* reels: binary search had two
consecutive steps whose visualisation was identical apart from the caption, and
a two-pointers step had 16 words of narration. Both were fixed at the source.

### Curated reels are built, not written by hand

`seed_reels.py` builds `reels.json` from Python, so the schema validates the
content at build time rather than the app discovering a malformed reel at
runtime. A test asserts the shipped JSON still matches what the source produces,
so the two cannot drift.

```bash
python seed_reels.py --out ../LeetSwipe/assets/data/reels.json
```

## Cost control

| Lever | Effect |
|---|---|
| `--limit N` | hard cap on problems per run — the main spend control |
| `--min-per-problem N` | the target; runs cost nothing once it is met |
| `--num N` | questions requested per problem |
| `--model` | `claude-haiku-4-5` is roughly 5× cheaper than Opus for this |
| `--llm-review` | off by default; roughly doubles cost when on |

A run that generates nothing costs nothing — the stock check happens before any
model call.
