# LeetSwipe

A swipe-style app for practicing LeetCode problems — think Tinder, but for coding
interview questions. Swipe through curated problems, save the ones you want to revisit,
and get fresh questions generated on demand.

## Stack
- **Frontend:** React / Expo (swipe UI)
- **Backend:** Python AI agents for question generation + curation (`backend_question_generation/`)
- **Data:** MongoDB, LeetCode query + scraping pipeline

## Structure
- `frontend/` — mobile/web swipe interface
- `backend_question_generation/` — AI agents (`agents.py`, `prompts.py`) that generate and format problems
- `leetcode_q_extractor.ts` — scrapes/normalizes LeetCode question data
