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
   filler. Keep all four options similar in length and specificity so the answer
   cannot be guessed from formatting. IMPORTANT: vary which position (0-3) holds
   the correct answer across the set — do not always put it first.

4. DISTINCT ANGLES: When asked for multiple questions about one problem, make each
   one test a *different* facet — e.g. one on data-structure/approach choice, one on
   time/space complexity, one on edge cases or why the brute force fails. Do not
   restate the same idea. Never reuse the answer's wording inside the question stem
   (no giveaways).

5. CALIBRATED DIFFICULTY: Match the difficulty of the source problem. Label each
   question Easy / Medium / Hard.

6. EXPLANATIONS: For each question, give a concise explanation (2-4 sentences) that
   (a) states why the correct option wins on correctness, efficiency, or robustness,
   and (b) explicitly names the most tempting distractor and says why it fails. This
   explanation is shown to the learner after they answer — whether right or wrong —
   so it must teach the underlying reasoning, not just declare the answer.

7. IDS: Set leetQuestionId to the problem's numeric id. Set questionId to that id
   followed by a capital letter (A, B, C, …) unique within this set.

8. TOPICS: Include 1-4 concise topic tags per question, derived from the problem's
   own tags where possible.

9. VISUALS: When a small diagram would genuinely sharpen the question — a concrete
   array with pointer labels, a short comparison table — fill the `visual` field
   using the documented format. Use real, small values (6-8 array cells max). The
   visual must set up the scenario WITHOUT giving away the answer: never highlight
   the element or row that resolves the question. For questions that are purely
   conceptual, omit the visual entirely; a decorative picture is worse than none.

Return ONLY the structured set of questions. Do not add commentary."""


def build_user_prompt(problem: dict, num_questions: int) -> str:
    """Render a single LeetCode problem into the user message.

    Works in two modes: when the problem dict carries the full statement
    (`content`), it is included verbatim; when it does not (e.g. problems seeded
    from the NeetCode-150 map, which only has title/category/difficulty), the
    prompt asks the model to draw on its own knowledge of the named problem —
    these are canonical, widely-documented interview problems.
    """
    tags = problem.get("topicTags") or []
    if tags and isinstance(tags[0], dict):
        tags = [t.get("name", "") for t in tags]
    hints = problem.get("hints") or []
    content = (problem.get("content") or "").strip()

    if content:
        statement = f"""problem statement:
\"\"\"
{content[:4000]}
\"\"\"

official hints (for your reasoning only, do not quote directly):
{chr(10).join(f'- {h}' for h in hints) if hints else '- none'}"""
    else:
        statement = """problem statement: not included. This is the well-known LeetCode
problem named above — use your own knowledge of it (its input/output contract,
the canonical optimal approach, common naive approaches, and classic pitfalls)
to write the MCQs. If you are not confident you know this exact problem, write
questions about the general technique its topic tags imply instead of guessing
problem-specific details."""

    return f"""Create {num_questions} MCQs for the following problem.

leetQuestionId: {problem.get('questionId')}
title: {problem.get('title')}
difficulty: {problem.get('difficulty', 'Medium')}
topic tags: {', '.join(tags) if tags else 'n/a'}

{statement}
"""
