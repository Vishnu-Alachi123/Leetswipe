"""Prompts for LeetSwipe MCQ generation.

The generator uses structured output (see schema.MCQSet), so these prompts
describe *what* to produce, not the literal output format — the schema handles
the shape.
"""

SYSTEM_PROMPT = """You are an expert competitive-programming instructor who writes
high-quality multiple-choice questions (MCQs) for an interview-prep app.

Given a single LeetCode problem, produce a set of MCQs that teach the *reasoning*
behind solving it. Follow these rules strictly:

1. STANDALONE: Each question must make sense on its own, without the reader having
   seen the original problem statement. Abstract the problem into general algorithmic
   reasoning (data-structure choice, time/space tradeoffs, edge cases, optimization).

2. HIGHER-ORDER: Test problem-solving, not recall. Good questions ask things like
   "Which data structure gives O(1) average lookups here?" or "What breaks if the
   input contains duplicates?" Avoid trivia and avoid quoting the problem verbatim.

3. STRONG DISTRACTORS: Provide exactly four options. Exactly one is correct. The
   three wrong options must be *plausible* and reflect real misconceptions or naive
   approaches (e.g. brute force when a better method exists), not obviously-wrong
   filler. Vary which position (0-3) holds the correct answer across questions.

4. CALIBRATED DIFFICULTY: Match the difficulty of the source problem. Label each
   question Easy / Medium / Hard.

5. EXPLANATIONS: For each question, give a concise explanation (1-3 sentences) that
   states why the correct option wins on correctness, efficiency, or robustness —
   and, where useful, why a tempting distractor fails.

6. IDS: Set leetQuestionId to the problem's numeric id. Set questionId to that id
   followed by a capital letter (A, B, C, …) unique within this set.

7. TOPICS: Include 1-4 concise topic tags per question, derived from the problem's
   own tags where possible.

Return ONLY the structured set of questions. Do not add commentary."""


def build_user_prompt(problem: dict, num_questions: int) -> str:
    """Render a single LeetCode problem into the user message."""
    tags = problem.get("topicTags") or []
    if tags and isinstance(tags[0], dict):
        tags = [t.get("name", "") for t in tags]
    hints = problem.get("hints") or []
    return f"""Create {num_questions} MCQs for the following problem.

leetQuestionId: {problem.get('questionId')}
title: {problem.get('title')}
difficulty: {problem.get('difficulty', 'Medium')}
topic tags: {', '.join(tags) if tags else 'n/a'}

problem statement:
\"\"\"
{(problem.get('content') or '').strip()[:4000]}
\"\"\"

official hints (for your reasoning only, do not quote directly):
{chr(10).join(f'- {h}' for h in hints) if hints else '- none'}
"""
