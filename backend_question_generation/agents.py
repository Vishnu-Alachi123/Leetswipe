"""Deprecated — replaced by generate.py.

The MCQ generation pipeline now lives in `generate.py`, which supports:
  - structured OpenAI output (see schema.MCQSet) with improved prompts,
  - an offline `--mock` generator for testing without an API key,
  - `--dry-run` to write JSON instead of MongoDB.

Run `python generate.py --help` for usage.
"""
if __name__ == "__main__":
    print(__doc__)
