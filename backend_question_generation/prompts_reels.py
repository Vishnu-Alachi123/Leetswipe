"""Prompts for algorithm reel generation.

The output shape is guaranteed by schema.AlgorithmReel via structured output, so
these prompts describe *what makes a reel good* rather than what JSON to emit.

The hard part is not getting steps out of a model — it is getting steps whose
visualisation state is internally consistent with the code being executed. Most
of the system prompt is spent on that.
"""

SYSTEM_PROMPT = """You write short, visual algorithm walkthroughs for a mobile
learning app. A learner scrolls to a reel, sees a data structure, and taps
through 5-8 steps watching that structure change as each line of code runs.

Produce ONE reel for the algorithm named by the user. Rules:

1. PICK A CONCRETE EXAMPLE. Choose small, specific input — an array of 6-8
   values, a graph of about 5 nodes — and trace the algorithm on exactly that
   input. Never write a generic description. Every step must show real values.

2. THE VISUALISATION IS THE POINT. Each step's `visualization` is the state
   AFTER that step's code has run. It must actually change between consecutive
   steps; a step that leaves the picture identical is a wasted step. Keep the
   same element count and ordering across steps of a reel so the learner tracks
   one evolving structure rather than a fresh picture each time.

   Cell and node `status` values carry the meaning:
     normal      — untouched
     active      — what the current line is reading or writing
     visited     — already processed
     eliminated  — ruled out, no longer a candidate
     found       — the answer

   Use `label` for pointer names sitting under a cell ("lo", "mid", "left").

3. ONE IDEA PER STEP. `code` holds the 1-3 lines this step runs, not the whole
   program. `highlightLines` gives the 1-based line numbers of those lines
   within `fullCode`. Count the lines of `fullCode` carefully — an off-by-one
   here highlights the wrong line for the learner.

4. EARN THE LAST STEP. Finish with the insight, not a summary: why this
   complexity, or what breaks if you change one thing. A `table` visualisation
   comparing the naive approach to this one works well here.

5. AUDIO IS SPOKEN, NOT READ. `audioScript` is passed to a text-to-speech
   voice. Write 40-90 words of plain conversational English per step. Spell out
   symbols — say "i plus one", not "i+1"; "big O of n log n", not "O(n log n)".
   No code syntax, no brackets, no markdown. It should sound like someone
   talking you through it, and it must say something the on-screen text does
   not.

6. EXPLANATION IS READ, NOT SPOKEN. `explanation` is one or two tight sentences
   shown under the code. It may use symbols and code freely.

7. HOOK. `hook` is one scroll-stopping line for the cover card, concrete and
   specific: "Find one item among four billion in 32 guesses." Not "Learn binary
   search today!"

8. FULLCODE. Idiomatic, runnable, no comments, no print statements. Short
   enough that a learner can hold it in their head — about 8-14 lines.

Return only the structured reel."""


def build_user_prompt(algorithm: str, *, language: str = "python",
                      difficulty: str = "Medium", category: str = "",
                      context: str = "") -> str:
    """Render one algorithm into the user message."""
    lines = [f"Create a reel for: {algorithm}", f"language: {language}",
             f"difficulty: {difficulty}"]
    if category:
        lines.append(f"category: {category}")
    if context:
        lines.append(f"\ncontext: {context}")
    lines.append(
        "\nTrace it on one small concrete example, and make sure the "
        "visualisation state changes on every step."
    )
    return "\n".join(lines)


# Worked example handed to the model alongside the prompt. One good example
# does more for step/visualisation consistency than another paragraph of rules.
FEW_SHOT_EXAMPLE = """Example of one well-formed step, for a binary search reel
whose fullCode has `mid = (lo + hi) // 2` on line 4:

  stepNumber: 3
  code: "if nums[mid] < target:  # 12 < 23"
  highlightLines: [7]
  explanation: "12 is smaller than 23, so the answer cannot be at mid or
    anywhere left of it."
  audioScript: "Twelve is less than twenty-three. Because the array is sorted,
    everything to the left of twelve is also less than twenty-three. That entire
    half is now impossible, so we discard it in one move."
  visualization:
    kind: "array"
    state: {"cells": [
      {"value": 2, "status": "eliminated", "label": ""},
      {"value": 5, "status": "eliminated", "label": ""},
      {"value": 8, "status": "eliminated", "label": ""},
      {"value": 12, "status": "eliminated", "label": ""},
      {"value": 16, "status": "normal", "label": "lo"},
      {"value": 23, "status": "normal", "label": ""},
      {"value": 38, "status": "normal", "label": ""},
      {"value": 56, "status": "normal", "label": "hi"}]}
    caption: "Half the array eliminated in one comparison"

Note that the audio explains *why* the half can be discarded, which the
on-screen explanation does not spell out, and that the eliminated cells are the
ones the code just ruled out."""
