# Testing LeetSwipe

Three layers, in the order they should be run. The first two are fast enough to
run on every change; the third is what catches the bugs the other two cannot
see, because most of this app's failures are *layout and interaction* failures
on a phone rather than wrong return values.

## 1. Unit tests

```bash
cd LeetSwipe && npm test          # 26 tests — code runner, instrumentation, challenges
cd backend_question_generation && python3 -m pytest -q   # 103 tests — generation pipeline
cd LeetSwipe && npx tsc --noEmit  # types
```

The JS suite bundles `api/code-runner.ts` with esbuild and runs it under plain
node, so no React Native runtime is needed. It also validates every shipped
challenge: each reference solution must pass its own tests, and each starter
template must *fail* them (a challenge whose starter already passes is not a
challenge).

## 2. Web export

```bash
cd LeetSwipe && npx expo export --platform web
```

The export is built for a sub-path (`experiments.baseUrl = "/Leetswipe"` in
`app.json`), because it is served from GitHub Pages under
`/Leetswipe/`. That matters when serving it locally:

```bash
mkdir -p /tmp/webroot && cp -r dist /tmp/webroot/Leetswipe
cd /tmp/webroot && npx serve . -l 8099
# → http://localhost:8099/Leetswipe/
```

Serve **without** `-s`. The SPA-rewrite flag sends every path to the root
`index.html`, which makes every route render the router's 404 screen and looks
exactly like a broken build. GitHub Pages resolves `/Leetswipe/challenge` to
`challenge.html` on its own, and plain `serve` matches that behaviour.

## 3. Device-shaped browser pass

This is the layer that found every bug fixed in the September 2026 audit. Drive
the built export in Chromium at real phone viewports and assert on what is
actually on screen.

```js
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
```

Sizes worth covering: **320×568** (smallest phone still in use), **375×667**,
**390×844**. Also run at least one pass with `colorScheme: 'light'` — the app
paints itself from a fixed dark palette, so a light-mode device is a distinct
code path for anything that reads the system scheme.

Two gotchas that will otherwise waste an afternoon:

- **React Native Web ignores Playwright's synthetic `.click()`** on `Pressable`.
  Use a real pointer sequence (`mouse.move` → `mouse.down` → `mouse.up`), or a
  working button will look broken.
- **`getBoundingClientRect()` reports layout position, not visibility.** Inside
  a clipping scroll container it happily returns coordinates for content the
  user cannot see. To check something is really visible, compare its rect
  against `window.innerHeight` *and* confirm its scroll container's `scrollTop`.
  Page-level overflow is `document.documentElement.scrollWidth > clientWidth`.

## Audit log — September 2026

Found by driving the challenge screen and the Learn feed the way a learner uses
them. All are fixed and carry regression tests where a test can express them.

| Bug | Effect | Fix |
|---|---|---|
| Loop budget shared across test cases | A **correct** O(n) solution failed after ~6 cases with "is there an infinite loop?" — the grader blaming the learner for its own limit | Budget resets per case (`Compiled.resetBudget`) |
| Unbraced `do` body mis-instrumented | `do i++; while (c);` was rewritten to `do do i++; while(c){…}` — valid code turned into a syntax error, and the only loop shape with no budget check in it | Body wrapped in a block and ticked |
| Brace counter shadowed in `instrument` | Loop bodies never incremented the outer depth, so do-while detection drifted and appended a stray block to the `while` tail | Inner counter renamed `parens` |
| Raw V8 messages surfaced to learners | "Invalid or unexpected token" with no position — useless on a phone, especially for autocorrect's curly quotes | `describeCompileError`: names smart quotes, unbalanced brackets, and near-miss function names |
| One typo reported four times | A single `retrun` rendered as four separate red failures | `RunOutcome.commonError`, shown once above the list |
| Results rendered below the fold | On a phone, tapping **Run tests** appeared to do nothing | Keyboard dismissed and results scrolled into view from their `onLayout` |
| Reel code pane clipped | Pane height was not a multiple of the line height and flex-shrank on short screens, slicing a row through its glyphs | Height snapped to whole lines, `flexShrink: 0`, extra tier for <620pt screens |
| Chrome followed the system colour scheme | White tab bar and stack backgrounds framing a dark app on a light-mode device | Navigation theme pinned dark (`app/_layout.tsx`) |
| `app/modal.tsx` | Leftover Expo template screen ("This is a modal") shipped as a public route | Deleted |

### Checked and found correct

Worth recording so they are not re-investigated: swipe-right saves and marks
cards seen; the Saved list reflects it; Pattern Match, Profile, Explore and the
Learn feed render with no console errors at any tested size; no page-level
horizontal overflow at 320px; all five shipped challenges are solvable; deep
links to every route resolve under the Pages base path.

### Known gaps

- **Only 5 code challenges** ship. The swipe deck has 450 MCQs, so the Write
  format is by far the thinnest of the three.
- **Cross-device sync and the leaderboard need the server deployed**; without
  it, sign-in stores a device-local profile only (see `GOOGLE_SIGNIN.md`).
- Reels generated since the last audio run narrate with the on-device voice
  until `generate_audio.py` is run for them.
