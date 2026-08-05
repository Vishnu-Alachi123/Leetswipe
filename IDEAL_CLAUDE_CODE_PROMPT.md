# LeetSwipe v2 — Ideal Prompt for Claude Code (Copy-Paste Ready)

> **Historical.** This was written to plan and commission v2.0. The Phase 1
> work (deduplication, quality gates, multi-format schema, code execution) and
> much of Phase 2-3 (algorithm reels, the Learn tab, code challenges, UI polish)
> has since been built directly in the repo. Do not re-submit this as a task —
> see `V2_EXECUTIVE_SUMMARY.md` for what shipped and what is genuinely still
> open, and `backend_question_generation/GENERATION.md` for how the pipeline
> works now.


**Use this prompt to submit to Claude Code for Phase 1 implementation.**  
**Recommended Model:** Claude Opus 5 with Vision enabled  
**Estimated Time to Completion:** 2-3 days (15-20 hours)

---

## COPY-PASTE PROMPT (Ready for Claude Code)

```
# LeetSwipe v2 Phase 1: Foundation & Question Quality System

**Context:** LeetSwipe is a React Native interview prep app with 450 AI-generated MCQs 
from NeetCode-150. We're expanding to support multi-format questions (MCQ, Code, Algorithm 
Reels). Phase 1 establishes the infrastructure.

**Goal:** Implement question deduplication, quality validation, and new question schemas 
to prevent duplicate generation and ensure high-quality questions.

**Scope (2-3 days):**

1. **Question Deduplication System**
   - Create `backend_question_generation/deduplication.py` module
   - Implement content-based hashing (MD5 of question text + options)
   - Implement similarity detection (>95% overlap flagged as duplicate)
   - Test with sample questions (prove zero duplicates in 450 existing questions)

2. **Enhanced Question Schema** 
   - Update `backend_question_generation/schema.py`:
     * Add metadata fields: generatedAt (ISO timestamp), sourceSlug, qualityScore (1-5), 
       explanationQuality (1-5), isDuplicate (boolean)
     * Create new types: CodeQuestion, AlgorithmReel (see detailed schema below)
     * Maintain backward compatibility with existing MCQ schema
   - Add validation: ensure qualityScore <= 5, isDuplicate is boolean, etc.

3. **Quality Validation Pipeline**
   - Update `generate.py` to add post-generation QA step:
     * Use Claude to review each question: "Is this a high-quality, unique question? 
       Output: yes/no/improve"
     * If "no": Flag for manual review, don't include in output
     * If "improve": Re-generate that question
     * Track: totalGenerated, accepted, rejected, regenerated
   - Log quality report: "Generated 120 questions: 105 accepted, 12 rejected, 3 regenerated"

4. **Deduplication in Workflow**
   - Update `generate.py` main() to:
     * Load existing questions.json
     * For each newly generated question, check against all existing
     * Skip if hash matches (identical)
     * Warn if similarity > 95% (flag but include, manual review later)
     * Final output: only truly new questions
   - Update workflow to log: "450 existing + 15 new = 465 total questions"

5. **Code Execution Sandbox Setup**
   - Create `backend_question_generation/code_executor.py`:
     * Judge0 API wrapper (https://judge0.com)
     * Methods: submitCode(language, code, testCases), pollResult(token)
     * Handle timeouts (10s max per execution)
     * Return format: {passed: bool, output: str, error: str, time: int}
   - Store Judge0 API key as environment variable (JUDGE0_API_KEY)
   - Test with 5 sample problems (Python + JavaScript)

6. **Testing & Verification**
   - Unit tests for deduplication:
     * Prove identical questions flagged
     * Prove >95% similar questions detected
     * Prove unique questions pass
   - Integration tests:
     * Generate 100 questions, verify zero duplicates
     * Run code executor on 5 problems, verify results
   - Report: "Deduplication: PASS (0 duplicates in 450 questions)"

**Detailed Schemas:**

Replace/extend schema.py with these types:

\`\`\`python
from pydantic import BaseModel, Field
from typing import List, Literal, Union
from datetime import datetime

class MCQQuestion(BaseModel):
    # Existing fields (keep as-is)
    type: Literal["mcq"] = "mcq"
    questionId: str
    leetQuestionId: int
    title: str
    topics: List[str]
    category: str
    lists: List[str]
    source: Literal["llm", "mock", "curated"]
    sourceSlug: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    question: str
    options: List[str]
    answer: int
    explanation: str
    
    # NEW FIELDS (quality tracking)
    generatedAt: datetime = Field(default_factory=datetime.utcnow)
    qualityScore: int = Field(default=5, ge=1, le=5)  # 1-5
    explanationQuality: int = Field(default=5, ge=1, le=5)  # 1-5
    isDuplicate: bool = False
    contentHash: str = ""  # MD5 of question + options
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class CodeQuestion(BaseModel):
    """Programming problem: write actual code"""
    type: Literal["code"] = "code"
    questionId: str
    title: str
    problemStatement: str
    language: Literal["javascript", "python", "java"]
    starterCode: str
    solution: str  # Reference solution
    testCases: List[dict]  # [{input: str, expectedOutput: str}]
    hints: List[str]  # 3 progressive hints
    explanation: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    category: str
    timeEstimate: int  # minutes
    spaceComplexity: str  # "O(n)", "O(n²)", etc.
    qualityScore: int = Field(default=5, ge=1, le=5)
    generatedAt: datetime = Field(default_factory=datetime.utcnow)

class AlgorithmReel(BaseModel):
    """Educational reel: step-by-step algorithm breakdown"""
    type: Literal["reel"] = "reel"
    reelId: str
    algorithmName: str  # "Quicksort", "BFS", "Fibonacci DP"
    description: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    language: Literal["javascript", "python"]
    duration: int  # seconds
    tags: List[str]
    
    # Step-by-step breakdown
    steps: List[dict]  # [
    #   {
    #     stepNumber: 1,
    #     code: "arr = [3, 1, 4]",
    #     explanation: "Initialize array",
    #     audioScript: "We start with an unsorted array...",
    #     visualization: {
    #       type: "array",
    #       state: [{index: 0, value: 3, color: "blue"}, ...]
    #     }
    #   },
    #   ...
    # ]

class QuestionSet(BaseModel):
    """Collection of questions (for bundled deck)"""
    questions: List[Union[MCQQuestion, CodeQuestion, AlgorithmReel]]
    totalCount: int
    generatedAt: datetime
    version: str  # "1.0.0"
\`\`\`

**Deliverables (Files to Create/Update):**

1. backend_question_generation/deduplication.py
   - Functions: 
     * question_hash(question: dict) -> str
     * similarity_score(q1: dict, q2: dict) -> float (0-1)
     * deduplicate(questions: List[dict]) -> List[dict]
   - Tests included (pytest)

2. backend_question_generation/schema.py
   - Updated with new Pydantic models (MCQ, Code, Reel, QuestionSet)
   - Backward-compatible migrations

3. backend_question_generation/code_executor.py
   - Judge0 API wrapper
   - Methods: submitCode(), pollResult(), handleError()
   - Documented with examples

4. backend_question_generation/generate.py
   - Updated main() to:
     * Call deduplication.deduplicate()
     * Run quality_validation() with Claude
     * Log report with stats
   - Add CLI arg: --skip-quality-check (for testing)

5. Tests:
   - tests/test_deduplication.py (pytest)
   - tests/test_code_executor.py
   - Tests prove zero duplicates in existing 450 questions

6. Documentation:
   - DEDUPLICATION.md (how it works, examples)
   - CODE_EXECUTOR.md (Judge0 setup, API key, rate limits)

**Verification Checklist:**

- [ ] Deduplication finds zero duplicates in existing 450 questions
- [ ] Similarity detection flags >95% overlap
- [ ] Quality validation rejects <3 quality scores
- [ ] Code execution works for Python + JavaScript
- [ ] New schema compiles (pydantic validation)
- [ ] Backward compatibility: old questions still work
- [ ] Tests pass (pytest)
- [ ] Generate new batch, verify no duplicates in combined set
- [ ] Git commits with clear messages

**Files to Modify:**
- backend_question_generation/schema.py (add new types)
- backend_question_generation/generate.py (integrate deduplication)
- .github/workflows/generate-questions.yml (add logging, optional)

**Files to Create:**
- backend_question_generation/deduplication.py
- backend_question_generation/code_executor.py
- backend_question_generation/DEDUPLICATION.md
- tests/test_deduplication.py
- tests/test_code_executor.py

**Assumptions:**
- Python 3.11+, pymongo, pydantic already installed
- Judge0 API key available (free tier or paid)
- Existing 450 questions in LeetSwipe/assets/data/questions.json
- Git workflow: feature branch → commit → push

**Success Criteria:**
1. Zero duplicate questions in test run (450 → 450)
2. Code executor successfully runs 5+ Python/JS test cases
3. New schema passes pydantic validation
4. All tests pass (pytest)
5. Code is well-documented with docstrings
6. Deployment: ready to merge to main

**Questions for Clarification:**
- Should we store quality scores in MongoDB or just log?
- How strict should "duplicate" detection be? (Currently: exact hash OR >95% similarity)
- Judge0 free tier (100 req/day) sufficient for MVP, or go paid immediately?
\`\`\`

---

## How to Use This Prompt

1. **Copy the prompt above** (between the backticks)
2. **Open Claude Code** → Create new session
3. **Select model:** Claude Opus 5 (toggle at top)
4. **Paste the prompt** into the message box
5. **Add context:** If needed, say "The repo is already set up with Expo React Native + Express backend"
6. **Submit and wait** for implementation (2-3 days)

---

## Expected Output

Claude will deliver:
- ✅ 5-6 Python files (new modules + updated existing)
- ✅ Test suite (pytest with 20+ test cases)
- ✅ Documentation (markdown guides)
- ✅ Git commits (well-organized, clear messages)
- ✅ Verification report (deduplication results, test summary)

---

## Follow-Up Prompts (For Phase 2)

After Phase 1 completes, submit these in order:

### Phase 2a: Reel Generation
```
# LeetSwipe Phase 2a: Algorithm Reel Generation

Using the new AlgorithmReel schema from Phase 1, generate educational reels 
for the top 50 NeetCode-150 problems.

For each problem:
1. Use Claude to create step-by-step algorithm breakdown
2. Generate visualization JSON (array/tree state at each step)
3. Create audio scripts (conversational, 50-100 words per step)

Deliverables:
- generate_reels.py (LLM prompt + structured output)
- reels.json (50 complete reels)
- Tests proving reels are well-formed

See CLAUDE_CODE_MASTER_PLAN.md section 2.1 for details.
```

### Phase 2b: Code Question Generation
```
# LeetSwipe Phase 2b: Code Challenge Generation

Generate CodeQuestion objects for top 30 NeetCode-150 problems 
(Python + JavaScript).

For each problem:
1. Problem statement (from LeetCode)
2. Starter code (boilerplate with TODO markers)
3. 3-5 test cases (edge cases, normal cases)
4. Reference solution
5. 3 progressive hints

Deliverables:
- generate_code_questions.py
- code_questions.json (60 questions: 30 problems × 2 languages)
- Judge0 validation (test all solutions)

See CLAUDE_CODE_MASTER_PLAN.md section 2.2 for details.
```

### Phase 3: UI Overhaul
```
# LeetSwipe Phase 3: UI/UX Polish & New Screens

Implement:
1. Design system (colors, typography, spacing)
2. New "Learn" tab (algorithm reels carousel)
3. Code challenge screen (editor + test runner)
4. Polish animations (confetti, transitions, gestures)

React components to create:
- app/(tabs)/learn.tsx
- components/ReelPlayer.tsx
- components/ReelCarousel.tsx
- components/CodeEditor.tsx
- components/TestRunner.tsx

See CLAUDE_CODE_MASTER_PLAN.md section 3 for details.
```

---

## Model Recommendation Rationale

**Why Claude Opus 5?**

1. **Complex Architecture:** Phase 1 requires understanding deduplication logic, quality validation, and multi-format schemas across 5+ files
2. **Code Quality:** Opus produces production-ready code (better type safety, error handling, documentation)
3. **Reliability:** Lower error rates on multi-file refactors and integrations
4. **Speed:** Faster output = less iteration cycles (saves time despite higher token cost)

**Cost Comparison:**
- Sonnet 5: ~$0.50 per phase (cheaper but needs more clarification/fixes)
- Opus 5: ~$1.50 per phase (higher cost but 40% fewer iterations needed)
- **Recommendation:** Use Opus for Phases 1-2 (architecture & generation), switch to Sonnet for Phase 3 (UI work)

---

## Alternative: Smaller Batch Approach

If you prefer to break Phase 1 into smaller chunks:

**Day 1:** Deduplication system only
```
# Create backend_question_generation/deduplication.py

Implement:
- question_hash(q: dict) -> str (MD5 of question + options)
- similarity_score(q1: dict, q2: dict) -> float (0-1, using difflib)
- deduplicate(questions: List[dict]) -> List[dict]
- Tests: prove 450 existing questions have zero duplicates

Deliverables: deduplication.py + test_deduplication.py
```

**Day 2:** Schema update + quality validation
```
# Update schema.py and integrate deduplication into generate.py

Update schema.py:
- Add qualityScore, explanationQuality, isDuplicate, generatedAt fields
- Create CodeQuestion and AlgorithmReel classes (minimal for now)

Update generate.py main():
- Load existing questions
- Deduplicate before writing new deck
- Log: "Generated X, deduplicated Y, final Z"

Deliverables: updated schema.py + generate.py
```

**Day 3:** Code executor + tests
```
# Create code_executor.py (Judge0 integration)

Implement:
- submitCode(language: str, code: str, testCases: List) -> str (token)
- pollResult(token: str) -> dict (execution result)
- Full test suite (5+ problems)

Deliverables: code_executor.py + test_code_executor.py
```

---

## Final Note

This master plan is designed to be submitted incrementally. After Phase 1 completes:
1. Review the output
2. Test locally (optional)
3. Submit Phase 2a prompt
4. Repeat for Phase 2b, then Phase 3

**Total timeline:** 6-8 weeks for full v2.0 launch.

Good luck! 🚀

