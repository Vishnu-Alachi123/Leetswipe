# LeetSwipe — Feature Brainstorm

Ideas for the next rounds, weighted toward the thing that actually separates
people who pass interviews from people who don't: **recognising which technique
a problem wants before writing any code**.

Most prep tools optimise for typing solutions. Almost nobody trains the two
minutes *before* the typing — reading a problem, spotting the shape, and picking
an approach. That gap is where LeetSwipe can be genuinely different, and it is
also the part that works well on a phone, where nobody wants to type.

---

## Part 1 — Algorithmic thinking

### 1.1 Pattern Match ⭐ highest value

Show a problem statement — no code, no options about implementation — and ask
only: **which pattern is this?**

> *"Given a sorted array, find two numbers summing to a target."*
> Two Pointers · Sliding Window · Binary Search · Hash Map

Interviewers are testing exactly this reflex, and it is currently untrained by
every tool on the market. It also fits the swipe deck with no new UI: it is an
MCQ whose options are the ~15 NeetCode patterns.

**Why it works on a phone:** ten seconds per rep, hundreds of reps.
**Data:** already have it — every question carries `category` and `sourceSlug`.
A generator variant emits pattern-recognition questions from the same problems.
**Effort:** small. New prompt + question `mode` field.

### 1.2 "What breaks?" — counterexample hunting

Show a *plausible but subtly wrong* solution and ask for the input that breaks it.

> Two Sum solved with a hash map, but it stores before checking.
> Which input fails? `[3,3], 6` · `[1,2], 3` · `[], 0` · `[-1,-2], -3`

This trains the edge-case instinct that separates "it works on the sample" from
"it works". It is also the single most common interview failure mode.

**Effort:** medium. Needs the generator to produce a broken variant plus the
input that exposes it — and the on-device runner can *verify* the breakage,
which means the answer key is machine-checked rather than trusted.

### 1.3 Complexity Estimator

Show a snippet, ask for its time complexity — but weight toward the cases people
get wrong: nested loops with early exit, amortised resizing, recursion with
memoisation, `while` loops over two pointers.

**Effort:** small. Same MCQ shape; the visual system already renders a
complexity comparison table.

### 1.4 Approach Ladder

One problem, four solutions from brute force to optimal. The learner orders them
by efficiency, then sees each one's trade-off.

Teaches the interview narrative — "here's the naive approach, here's why it's
slow, here's the improvement" — which is what interviewers actually score.

**Effort:** medium. New interaction (drag to order); reuses reel visualisations
for each rung.

### 1.5 Trace the Execution

Show code plus an input, pause mid-run, ask what a variable holds right now.

The reel engine already does step-through with per-step state — this is the same
data with the answer hidden. Very cheap given what exists.

**Effort:** small. Reuse `AlgorithmReel` steps, blank one value, ask for it.

### 1.6 Constraint Reading

Give only the constraints, ask what they imply.

> `1 ≤ n ≤ 10⁵` → what complexity do you need?
> `1 ≤ n ≤ 20` → what does that *invite*? (exponential/bitmask is fine)

Experienced candidates read constraints first and let them dictate the approach.
This is a genuine pro habit that is never explicitly taught.

**Effort:** small.

---

## Part 2 — Retention

### 2.1 Spaced repetition ⭐ biggest retention lever

Questions answered wrong return tomorrow; questions answered right return in
3 days, then 7, then 30. Scientifically the strongest tool available, and it
turns Saved from a list into a study system.

**Effort:** medium. Needs a review schedule per saved question and a "due today"
view. Everything else is already there.

### 2.2 Confidence-weighted answering

After answering, tap *sure* or *guessed*. A lucky guess should not count as
learned — it should come back sooner than a confident correct answer.

Cheap to add, and it makes spaced repetition substantially more honest.

### 2.3 Daily Mix

One tap: five questions assembled from your weakest pattern, a due review, and
something new. Removes the "what should I study?" decision that kills sessions
before they start.

---

## Part 3 — Gamification (the kind that isn't hollow)

The rule I'd apply: **reward the behaviour that produces learning, never the
behaviour that produces numbers.** Points for volume produce mindless swiping.

### 3.1 Pattern Mastery map

A grid of the ~15 patterns, each filling in as you demonstrate competence
(say 8 of 10 correct across separate sessions). Progress you can *see*, tied to
something real, and it doubles as a study plan — the empty cells tell you what
to do next.

Better than XP because it maps to interview readiness rather than time served.

### 3.2 Streaks with one repair token

Already have streaks. Add: earn a "freeze" every 7 days that covers one missed
day. Duolingo's data is unambiguous — losing a long streak to one bad day makes
people quit entirely, and the repair keeps them.

### 3.3 Interview Simulator

Timed run: 10 pattern-recognition questions in 5 minutes, scored on accuracy and
speed. Produces a readiness percentage that trends over weeks.

Creates natural urgency without a fake leaderboard, and it is the closest thing
to the real pressure.

### 3.4 Achievements tied to insight, not volume

- **Counterexample Hunter** — find 10 breaking inputs
- **Pattern Sniper** — 20 correct pattern IDs in a row
- **Complexity Native** — 15 complexity questions with no mistakes
- **Deep Diver** — every walkthrough in one category

Note none of these are "answer 100 questions". Volume badges reward scrolling.

### 3.5 Weekly Recap

"You got stronger at Two Pointers, weaker at DP. 3 problems due for review."
A specific, honest report beats a generic notification, and gives a reason to
return that isn't guilt.

---

## Part 4 — Content

### 4.1 Reels for the *patterns*, not just algorithms

Current reels teach specific algorithms. A parallel set could teach the
recognition signal itself: *"How to spot a sliding-window problem"* — three
problems that look unrelated, all solved by the same technique.

This is the reel format doing what it is uniquely good at: showing structure.

### 4.2 "Two problems, one technique"

Show two problems that look nothing alike, reveal the shared skeleton. Transfer
is the hard part of learning algorithms, and this attacks it directly.

### 4.3 Reels on failure modes

*"Why your binary search has an infinite loop"* — the off-by-one, visualised
step by step. Debug-shaped content, which is what people actually search for.

---

## Part 5 — Smaller wins

| Idea | Why | Effort |
|---|---|---|
| Onboarding (4 cards) | People don't discover Learn or Saved today | S |
| Daily notification | 30-50% DAU lift in comparable apps | S |
| Share a result card | Free growth; screenshots travel | S |
| Bookmark a reel step | "The bit I didn't get" is rarely a whole reel | S |
| Playback speed for narration | 1.5× is table stakes for audio content | S |
| Dark/light toggle | Currently system-only | S |
| Offline badge | Make the offline-first strength visible | S |
| Python alongside JS challenges | Most interview prep is in Python | M |

---

## Suggested order

**Next:** Pattern Match (1.1) + Pattern Mastery map (3.1). Together they are one
coherent feature — a new question mode plus the progress surface that gives it
meaning — and they hit the thinking-over-typing goal squarely.

**Then:** spaced repetition (2.1) with confidence weighting (2.2). This is what
turns a browsing app into a study tool, and it makes everything already built
more valuable.

**Then:** "What breaks?" (1.2), because the on-device runner can machine-verify
the answers — a quality guarantee no competitor has.

**Deliberately later:** notifications, sharing, onboarding. All worth doing, none
of them change what the product *is*.

---

## What I'd avoid

- **XP and leaderboards.** Rewards volume, and volume is not learning here.
- **Hearts / lives.** Punishes exploration; wrong answers are how you learn.
- **A full code editor.** Expensive, and phones are bad at typing. The current
  short-function challenges are the right size for the device.
- **Video lessons.** Ten times the production cost of reels for less
  interactivity, and reels already carry the visual explanation.
