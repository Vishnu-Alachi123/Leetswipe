# LeetSwipe v2 — Master Plan for Claude Code Implementation

> **Historical.** This was written to plan and commission v2.0. The Phase 1
> work (deduplication, quality gates, multi-format schema, code execution) and
> much of Phase 2-3 (algorithm reels, the Learn tab, code challenges, UI polish)
> has since been built directly in the repo. Do not re-submit this as a task —
> see `V2_EXECUTIVE_SUMMARY.md` for what shipped and what is genuinely still
> open, and `backend_question_generation/GENERATION.md` for how the pipeline
> works now.


**Document Version:** 1.0  
**Priority Level:** High (3 phases, 6-8 weeks total)  
**Recommended Model:** Claude Opus 5 (best for complex architecture + multi-part implementation)

---

## Executive Summary

LeetSwipe is expanding from MCQ-only to a comprehensive multi-format learning platform with:
1. **Code-based problems** (write & execute actual code)
2. **Algorithm visualization** (line-by-line execution with data structure state)
3. **Audio explanations** (AI-narrated walkthroughs)
4. **TikTok-style "educational reels"** (short-form algorithm tutorials)
5. **Polished UI/UX** (design overhaul)
6. **Verified question generation** (no duplicates, quality assurance)

---

## Phase 1: Foundation & Infrastructure (2 weeks)

### 1.1 Question Generation Pipeline Enhancement

**Current Issue:** Automated workflow not producing visible new questions; potential duplicate generation risk.

**Solution:**
- Add deduplication logic to question generation
- Create question metadata table tracking:
  - `questionId` (unique)
  - `sourceSlug` (link to original problem)
  - `generatedAt` (timestamp)
  - `quality_score` (1-5 from LLM validation)
  - `explanation_quality` (1-5 for explanation clarity)
  - `is_duplicate` (boolean flag)
- Implement pre-generation deduplication:
  - Hash question content + options
  - Skip if identical question exists
  - Flag if "too similar" (>95% content overlap)
- Add post-generation QA:
  - LLM review: "Is this a high-quality, unique question?" (yes/no/improve)
  - Reject low-quality, duplicate, or unclear questions
  - Re-generate if rejected

**Deliverables:**
- Updated `schema.py` with quality fields
- `deduplication.py` module for content hashing + similarity
- Updated `generate.py` with quality validation step
- New "question inspection" report (daily summary)

**Why:** Ensures 450 → 600+ unique, high-quality questions over time

---

### 1.2 New Question Type Schema

**Create multi-format question schema:**

```python
# Existing (keep as-is, rename to MCQQuestion)
class MCQQuestion(BaseModel):
    type: Literal["mcq"]
    questionId: str
    question: str
    options: List[str]  # 4 options
    answer: int  # 0-3
    explanation: str
    # ... existing fields

# New
class CodeQuestion(BaseModel):
    type: Literal["code"]
    questionId: str
    title: str
    problemStatement: str
    starterCode: str  # Language-specific boilerplate
    testCases: List[dict]  # {input: ..., expectedOutput: ...}
    solution: str  # Reference solution
    explanation: str
    hints: List[str]  # 3 progressive hints
    language: Literal["javascript", "python", "java"]  # Add more later
    difficulty: Difficulty
    category: str
    timeEstimate: int  # minutes
    spaceEstimate: str  # "O(n)", "O(1)", etc.

class AlgorithmReel(BaseModel):
    type: Literal["reel"]
    reelId: str
    algorithmName: str  # "Quicksort", "BFS", "DP - Fibonacci"
    description: str
    language: Literal["javascript", "python"]
    codeSteps: List[dict]  # [{code: "...", explanation: "...", audioUrl: "..."}]
    visualization: dict  # {type: "array/tree/graph", steps: [...]}
    audioExplanation: str  # Audio file URL or text-to-speech marker
    duration: int  # seconds
    difficulty: Difficulty
    tags: List[str]

class Question(BaseModel):
    """Union of all question types"""
    __root__: Union[MCQQuestion, CodeQuestion, AlgorithmReel]
```

**Deliverables:**
- Updated `schema.py` with new types
- Backward-compatible database migrations
- Type validation (pydantic)

---

### 1.3 Code Execution Sandbox Setup

**Goal:** Safely execute user-submitted code

**Approach:**
- Use Judge0 API (free tier: 100 req/day, paid: $10/mo for unlimited)
  - Alternative: PyCodeObject (Python only, on-device)
  - Fallback: Monaco Editor (syntax highlighting only for MVP)
- Store API key as GitHub secret
- Create `code_executor.py` wrapper:
  ```python
  async def execute_code(language, code, testCases):
      # Submit to Judge0
      # Poll for result
      # Return {passed: bool, output: str, error: str, time: ms}
  ```

**Deliverables:**
- `code_executor.py` (Judge0 wrapper)
- Error handling + timeout logic
- Rate limiting (respect API quota)

**Why:** Users can write and test code directly in the app

---

## Phase 2: Content Generation & Visualization (3 weeks)

### 2.1 Algorithm Reel Generation

**Generate "educational reels" from existing problems:**

Prompt design for Claude/OpenAI:
```
For the problem "{problemName}", create an algorithm visualization reel:

1. Break the algorithm into 5-8 executable steps
2. For EACH step, provide:
   - Code snippet (1-3 lines max)
   - What changes in the data structure?
   - Voice-over script (100 words max, conversational)
   - Visualization state (JSON format)

Example format:
{
  "step": 1,
  "code": "arr = [3, 1, 4, 1, 5]  # unsorted",
  "explanation": "Start with unsorted array",
  "audioScript": "We have an unsorted array with 5 numbers...",
  "visualization": {
    "type": "array",
    "state": [
      {index: 0, value: 3, highlighted: true, color: "blue"},
      {index: 1, value: 1, highlighted: false, color: "gray"},
      ...
    ]
  }
}
```

**Process:**
1. Select top 50 NeetCode-150 problems (prioritize: sorting, searching, DP, graphs)
2. For each problem:
   - Generate algorithm reel (with LLM)
   - Create visualization JSON (structured output)
   - Generate audio script (text provided to text-to-speech service)
3. Store in `reels.json` (similar to `questions.json`)

**Text-to-Speech Strategy (MVP):**
- Option A: Use browser's Web Speech API (free, no setup)
- Option B: Google TTS API ($4-6 per 1M chars)
- Option C: ElevenLabs ($11/mo for unlimited, best quality)
- **Recommendation for MVP:** Option A (browser TTS) → upgrade to C in v1.1

**Deliverables:**
- `generate_reels.py` (LLM prompt + structured output)
- `reels.json` (first 50 algorithms)
- Updated `quickstart.py` to store reels in MongoDB
- Frontend: `ReelPlayer.tsx` component

---

### 2.2 Code Question Generation

**Generate code problems from NeetCode-150:**

Prompt:
```
For the LeetCode problem "{problemName}" (difficulty: {difficulty}), create:

1. Starter code (remove solution, leave TODOs)
2. Test cases (3-5 representative cases)
3. Solution code (correct implementation)
4. Hints (3 progressive hints, from "approach" to "near-solution")

Return as JSON with these exact fields:
{
  "questionId": "...",
  "title": "...",
  "problemStatement": "...",
  "starterCode": "...",
  "testCases": [...],
  "solution": "...",
  "hints": [...],
  "explanation": "..."
}
```

**Process:**
1. Generate for top 30 NeetCode-150 problems (diverse algorithms)
2. Support 2 languages initially: Python + JavaScript
3. Store in `code_questions.json`

**Deliverables:**
- `generate_code_questions.py`
- `code_questions.json` (30 problems × 2 languages = 60 questions)
- Updated schema + API endpoints

---

### 2.3 Visualization Engine

**Create algorithm step visualization:**

Data structure:
```python
class VisualizationStep(BaseModel):
    stepNumber: int
    code: str  # 1-3 lines
    explanation: str  # User-friendly description
    visualization: dict  # Format varies by type:
    # Array: [{index, value, highlighted, color}]
    # Tree: {nodes: [...], edges: [...]}
    # Graph: {nodes: [...], edges: [...]}
    # Pointer/Variable: {name, value, type}
    audioScript: str  # Text for TTS
```

Frontend component (`ReelPlayer.tsx`):
```tsx
<ReelPlayer
  reel={reel}
  currentStep={step}
  visualization={visualization}
  onNextStep={handleNext}
  showAudio={true}
/>
```

Features:
- Syntax-highlighted code (Monaco Editor)
- Animated visualization (data structure state changes)
- Play/pause/step controls
- Audio playback (with pause/resume)
- Speed control (0.5x - 2x)

**Deliverables:**
- `VisualizationRenderer.tsx` (generic renderer for array/tree/graph/pointer)
- `ReelPlayer.tsx` (controller component)
- `AnimationEngine.ts` (step transitions, timing)

---

## Phase 3: UI/UX Overhaul & Polish (2-3 weeks)

### 3.1 Design System

**Create cohesive design language:**

```
Color Palette (from UX_IMPROVEMENTS.md, enhanced):
- Primary:    #FF6B6B (energetic red for CTAs)
- Accent:     #4ECDC4 (teal, interactive elements)
- Success:    #51CF66 (green, correct answers)
- Warning:    #FFD93D (yellow, alerts)
- Danger:     #FF6B6B (red, errors)
- Dark BG:    #121212 (OLED-friendly)
- Light BG:   #FFFFFF

Typography (established):
- Title:      28px, bold, leading 1.2
- Heading:    18px, bold
- Body:       16px, regular, leading 1.6
- Caption:    13px, gray, medium

Spacing: 8px grid system (8, 16, 24, 32, 48, 64px)
Border Radius: 12px (cards), 24px (pills)
```

**Deliverables:**
- `constants/design-system.ts` (colors, fonts, spacing)
- Storybook setup (document components)
- Updated all components to use design system

---

### 3.2 New Tab: "Learn" (Algorithm Reels)

**Add fourth tab for educational content:**

Navigation:
```
<Tabs>
  <Topics>      Swipe MCQs + choose category
  <Deck>        The swipe deck (moved here)
  <Learn>       Algorithm reels (NEW)
  <Saved>       Bookmarked content
</Tabs>
```

**Learn tab UI:**
```
- Carousel of reel thumbnails (algorithm name, difficulty, duration)
- Tap to open full reel player
- Filters: difficulty, algorithm type (sort, search, DP, etc.)
- Search bar
- Bookmarked reels (saved to local list)
```

**Deliverables:**
- `app/(tabs)/learn.tsx` (new tab)
- `components/ReelCarousel.tsx`
- `components/ReelPlayer.tsx` (immersive full-screen)

---

### 3.3 Code Challenge Screen

**New screen for coding problems:**

UI Flow:
```
1. Problem description (left panel or top section)
   - Problem title
   - Problem statement
   - Difficulty badge
   - Time/space estimates
   - Hint button (reveals 1 of 3)

2. Code editor (right panel or middle section)
   - Language selector (Python/JavaScript)
   - Starter code (read-only boilerplate + TODOs)
   - Editable function body
   - Syntax highlighting (Monaco Editor)
   - Line numbers + minimap

3. Test output (bottom section or right panel)
   - Run button (executes code)
   - Test case results:
     * ✅ Passed (2/3)
     * ❌ Failed: "Expected [1,2,3], got [3,2,1]"
     * Execution time: 45ms, Space: 12MB
   - Submit button (grades against hidden test cases)

4. Solution reveal (after correct submission or 2 hints)
   - Side-by-side comparison (user vs. solution)
   - Explanation + walkthrough
```

**Deliverables:**
- `app/code-challenge.tsx` (screen)
- `components/CodeEditor.tsx` (Monaco wrapper)
- `components/TestRunner.tsx` (display results)
- `api/code-executor.ts` (Judge0 integration)

---

### 3.4 Polished Card Animations & Transitions

**Enhance visual feedback:**

- Confetti on MCQ correct answer ✅ (already in UX plan)
- Smooth card transitions (swipe animations)
- Haptic feedback on gestures ✅ (already exists)
- Loading skeletons (not spinners)
- Toast notifications (vs. alerts)
- Gesture hints ("Swipe left to skip →")

**Deliverables:**
- `components/SwipeCard.tsx` (enhanced)
- `components/ConfettiCannon.tsx`
- `hooks/useGestureHints.ts`

---

## Phase 4: Quality Assurance & Launch (1-2 weeks)

### 4.1 Testing

- Unit tests (Jest) for code execution
- E2E tests (Detox) for swipe flow + code editor
- Cross-device testing (iPhone 12/14, Android 12/13)
- Performance: LCP < 1s, CLS < 0.1, FID < 100ms

### 4.2 Deployment

- Submit v2 to app stores (bump to 2.0.0)
- ProductHunt launch (new features highlight)
- Blog post + social media

---

## Current Issues to Resolve

### Issue 1: Automated Generation Not Producing New Commits

**Investigation:**
- Workflow runs every 6 hours but doesn't create new commits
- Possible causes:
  1. Generator produces same 450 questions (no new generation)
  2. Workflow runs but fails silently
  3. Conditional logic prevents bundle commits

**Fix:**
- Add workflow logging (echo progress after each step)
- Check git diff: `if git diff --quiet questions.json`
- If no diff, log "No new questions generated" (not an error)
- Manually trigger to verify: `gh workflow run generate-questions.yml -f target=bundle`

**Deliverables:**
- Enhanced workflow logging
- Manual test confirmation
- Monitoring dashboard (optional)

### Issue 2: Question Deduplication

**Risk:** Same question generated multiple times across workflow runs

**Fix:**
- Implement `question_hash()` function:
  ```python
  def question_hash(q):
      return hashlib.md5(
          f"{q['problemStatement']}{q['options']}{q['answer']}".encode()
      ).hexdigest()
  ```
- Before committing new deck, deduplicate:
  ```python
  seen = set()
  unique_questions = []
  for q in all_questions:
      h = question_hash(q)
      if h not in seen:
          unique_questions.append(q)
          seen.add(h)
  ```

**Deliverables:**
- `deduplication.py` module
- Updated `generate.py` to deduplicate before writing
- Test suite proving no duplicates

---

## Implementation Roadmap

| Phase | Week | Deliverables | Status |
|-------|------|--------------|--------|
| **1** | 1-2 | Schema, deduplication, sandbox, code execution | Ready |
| **2** | 3-5 | Reel generation, code questions, visualization | Ready |
| **3** | 6-8 | Learn tab, Code challenge screen, UI polish | Ready |
| **4** | 9-10 | QA, testing, app store submission | Ready |

**Total:** 10 weeks (2.5 months) to production v2.0

---

## Recommended Model & Approach

### Model Selection

**Claude Opus 5** (Recommended) ✅
- Reason: Handles complex architecture, multi-file refactors, algorithm visualization logic
- Best for: End-to-end feature implementation (Phase 1-3)
- Cost: Higher token usage but faster/better results

**Claude Sonnet 5** (Alternative)
- Good for: Component-level work, UI polish
- Cost: Lower token usage
- When to use: Phase 3 (UI/UX overhaul)

### Prompt Structure for Claude Code

See next section: **IDEAL_CLAUDE_CODE_PROMPT.md** (below)

---

## Dependencies & Tools

| Tool | Purpose | Cost | Status |
|------|---------|------|--------|
| Judge0 API | Code execution | $10/mo (paid) | ✅ Recommended |
| ElevenLabs TTS | Audio narration | $11/mo | ⚠️ Optional (start with Web Speech) |
| Monaco Editor | Code syntax highlight | Free | ✅ Already in use |
| React Native Gesture Handler | Swipe detection | Free | ✅ Already in use |
| Lottie | Animations | Free | ✅ Optional enhancement |
| Storybook | Component docs | Free | ✅ Optional |

---

## Success Metrics

**By end of Phase 1:**
- ✅ 600+ unique, deduplicated questions
- ✅ Zero duplicate questions detected in 100 random samples
- ✅ Code execution working for 5 test problems

**By end of Phase 2:**
- ✅ 50 algorithm reels generated
- ✅ Visualization working for 5+ algorithm types
- ✅ 30 code challenges available

**By end of Phase 3:**
- ✅ All UI components polished (A/B tested vs Duolingo/Quizlet)
- ✅ <2s load time for all screens
- ✅ 4.5+ star design rating from 20 beta testers

**Launch Metrics:**
- ✅ App Store & Play Store approval (24-48 hours)
- ✅ 5000+ downloads in first month
- ✅ 2+ rating average (no major crashes)

---

## Notes & Caveats

1. **Audio generation:** Start with free Web Speech API (browser-based), upgrade to ElevenLabs v1.1 if user retention warrants cost
2. **Code execution:** Judge0 free tier (100 req/day) is limiting; upgrade to paid ($10/mo) before public launch
3. **Visualization:** Start with arrays/trees; add graphs/linked lists in v2.1
4. **Scope creep:** Prioritize algorithm reels over community features in v2.0
5. **Testing:** Can't truly test code execution without live Judge0; plan for closed beta with 50 users

