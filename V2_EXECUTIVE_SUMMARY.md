# LeetSwipe v2.0 Executive Summary

> **This document is historical.** It was written to plan v2.0 before the work
> started. Most of what it proposes has since been built — see the "What
> actually shipped" section immediately below for current state, and
> [`backend_question_generation/GENERATION.md`](backend_question_generation/GENERATION.md)
> for how the pipeline works now. The estimates and phasing below were not what
> happened, and are kept only as a record of the original plan.

## What actually shipped

| Planned | Status | Where |
|---|---|---|
| Deduplication + quality gate | **Done** | `deduplication.py`, `quality.py` |
| Fix the scheduled generation job | **Done** | `generate.py`, `GENERATION.md` |
| Multi-format schema | **Done** | `schema.py` — `StoredMCQ`, `CodeQuestion`, `AlgorithmReel` |
| Algorithm reels with visualisation | **Done** | Learn tab; 5 curated reels, 32 steps |
| Narration | **Done**, via on-device `expo-speech` (not ElevenLabs — free and offline) |
| Reel generation | **Done** | `generate_reels.py`, 25-algorithm catalog |
| Code challenges | **Done**, graded on-device (not Judge0 — free and offline) | `app/challenge.tsx`, `api/code-runner.ts` |
| UI polish | **Partly done** | difficulty bars, streak card, celebration, layout fixes |
| Onboarding, notifications, analytics | **Not started** | — |
| Spaced repetition | **Not started** | — |

Two significant departures from this plan, both made to keep the app offline-first
and free to run:

1. **Narration uses on-device TTS**, not a hosted voice. No API key, no per-use
   cost, works on a plane.
2. **Code challenges execute on the device**, not through Judge0. Same reasons.
   Judge0 support still exists in `code_executor.py` for languages a phone
   cannot run, but nothing depends on it.

---

## Original plan (historical)

**Recommended Model:** Claude Opus 5  
**Estimated Timeline:** 6-8 weeks (3 phases)

---

## What We're Building

LeetSwipe v2 expands from **MCQ-only** → **multi-format learning platform** with:

### 1. 🧠 Algorithm Visualization Reels (TikTok-style)
- Step-by-step algorithm walkthroughs
- Line-by-line code execution visualization
- Data structure state changes (array, tree, graph)
- AI-narrated audio explanations
- 50 algorithms (sorting, searching, DP, graphs)

### 2. 💻 Code Challenges
- Write actual code (not just multiple choice)
- Test against Judge0 sandbox
- Progressive hints (1, 2, 3 reveal)
- Reference solutions
- 30 problems × 2 languages (60 challenges)

### 3. 🎨 Polished UI/UX
- Design system (cohesive colors, typography, spacing)
- New "Learn" tab (reel carousel)
- Code challenge screen (editor + test runner)
- Confetti animations + smooth transitions
- Responsive mobile-first design

### 4. ✅ Quality Assurance
- Deduplication system (MD5 hashing + similarity detection)
- Quality validation (LLM review each question)
- Zero duplicate guarantees
- Production-ready infrastructure

---

## Current Issues to Fix First

### Issue 1: Automated Generation Not Committing
- Workflow runs but doesn't create new commits
- Fix: Enhanced logging + manual test confirmation

### Issue 2: Potential Duplicate Questions
- Risk: Same question generated multiple times
- Fix: Implement deduplication (Phase 1, Week 1)

---

## Implementation Plan (3 Phases)

| Phase | Timeline | Deliverables | Status |
|-------|----------|--------------|--------|
| **1: Foundation** | Weeks 1-2 | Deduplication, schema, quality validation, code executor | 📋 Ready to submit |
| **2: Content** | Weeks 3-5 | 50 algorithm reels, 30 code challenges, visualization | 📋 Ready to submit |
| **3: UI/UX** | Weeks 6-8 | Design system, Learn tab, Code screen, animations | 📋 Ready to submit |

---

## How to Use the Planning Documents

### 1. 📄 CLAUDE_CODE_MASTER_PLAN.md
**What:** Comprehensive 20-page architecture document  
**Use:** Reference guide, implementation roadmap, technical decisions  
**Read:** Yes (5-10 min skim for overview)

### 2. 💬 IDEAL_CLAUDE_CODE_PROMPT.md
**What:** Copy-paste ready prompt for Claude Code  
**Use:** Direct submission to Claude Code (ready to go)  
**Read:** Maybe (skim the summary, copy the prompt)

### 3. 📊 This Document
**What:** Quick reference (this file)  
**Use:** Share with stakeholders, quick status check

---

## Next Steps

### Immediate (Today)
- ✅ Review the 2 planning documents
- ✅ Decide: Submit Phase 1 now? Or wait?

### If Submitting Now
1. Go to Claude Code (claude.ai/code)
2. Create new session, select Claude Opus 5
3. Copy prompt from **IDEAL_CLAUDE_CODE_PROMPT.md**
4. Paste and submit
5. Wait 2-3 days for Phase 1 completion

### If Waiting
- ✅ Optional: Manually test current workflow (ensure generation is working)
- ✅ Optional: Create landing page / marketing materials
- ✅ Optional: Set up Judge0 account (free tier is fine for testing)

---

## Success Metrics

**Phase 1 (End of week 2):**
- 600+ unique questions (up from 450)
- Zero duplicates proven by test suite
- Code executor working for 5 problems
- Pydantic schema validated

**Phase 2 (End of week 5):**
- 50 algorithm reels generated + tested
- 30 code challenges working
- Visualization JSON valid for 5+ algorithm types

**Phase 3 (End of week 8):**
- All screens pixel-perfect
- Sub-2s load times
- Ready for app store submission

**Launch (Week 9):**
- v2.0 live on App Store & Play Store
- 5000+ downloads first month

---

## Key Decisions Made

1. **TTS Strategy:** Use free Web Speech API (browser), upgrade to ElevenLabs ($11/mo) in v2.1
2. **Code Execution:** Judge0 API ($10/mo paid, free tier for MVP)
3. **Video vs. Reels:** Reels (animated + audio) instead of pre-recorded video (saves tokens + time)
4. **Languages:** Python + JavaScript initially, add more in v2.1
5. **Model:** Claude Opus 5 for best quality + speed on complex architecture

---

## Budget & Resources

| Item | Cost | Timeline | Required |
|------|------|----------|----------|
| Claude Opus 5 (2-3 days @ ~$3/phase) | ~$10 | Weeks 1-8 | YES |
| Judge0 API (paid tier) | $10/mo | Week 3+ | Optional (free tier OK for MVP) |
| ElevenLabs TTS | $11/mo | Week 3+ | Optional (use Web Speech initially) |
| Total (MVP launch) | $20-30 | 8 weeks | YES |

---

## FAQ

**Q: Is this too ambitious?**  
A: No. Breaking into 3 phases makes it manageable. Phase 1 is foundation only. Phases 2-3 are content + UX.

**Q: Why Opus 5 over Sonnet 5?**  
A: Complex architecture (5+ file refactors, multi-format schema) = higher error rate on Sonnet. Opus is 40% faster on iterations.

**Q: Can I start Phase 2 before Phase 1 completes?**  
A: No. Phase 1 creates the schema and tools Phase 2 depends on.

**Q: What if generation is still broken?**  
A: Fix it in Phase 1. The deduplication module will integrate with generate.py.

**Q: Timeline realistic?**  
A: Yes. 15-20 hours per phase × 3 = 45-60 hours total. At 2-3 hours/day = 3-4 weeks active work.

---

## Ready to Launch?

✅ **Architecture:** Complete  
✅ **Prompts:** Optimized for Claude Code  
✅ **Roadmap:** Clear milestones  
✅ **Budget:** Minimal ($20-30)  
✅ **Timeline:** Realistic (6-8 weeks)  

**Verdict: READY TO SUBMIT TO CLAUDE CODE** 🚀

