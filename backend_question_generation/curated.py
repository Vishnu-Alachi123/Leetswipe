"""Curated-list lookup for LeetSwipe MCQ generation.

Maps a source LeetCode problem to a study `category` (the bucket the app's topic
picker uses, e.g. "Arrays & Hashing") and the curated `lists` it belongs to
(e.g. ["neetcode150"]). The data lives in `lists/neetcode150.json`, derived from
the public NeetCode-150 list.

Matching is by LeetCode slug first (parsed from the problem's title), then by an
exact title match, so it works whether the problem dict carries a `titleSlug`,
`title`, or LeetCode URL.
"""
import json
import os
import re
from functools import lru_cache

_HERE = os.path.dirname(os.path.abspath(__file__))
_NEETCODE_PATH = os.path.join(_HERE, "lists", "neetcode150.json")


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


@lru_cache(maxsize=1)
def _neetcode() -> dict:
    try:
        with open(_NEETCODE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"bySlug": {}, "byTitle": {}, "categories": []}


def categories(list_name: str = "neetcode150") -> list[str]:
    """Ordered category names for a curated list."""
    return _neetcode().get("categories", []) if list_name == "neetcode150" else []


def classify(problem: dict) -> tuple[str, list[str]]:
    """Return (category, lists) for a source problem.

    Falls back to the problem's own primary topic tag when it is not part of a
    curated list, so every question still gets a sensible category.
    """
    data = _neetcode()
    slug = problem.get("titleSlug") or _slugify(problem.get("title", ""))
    entry = data.get("bySlug", {}).get(slug)
    if not entry:
        entry = data.get("byTitle", {}).get((problem.get("title", "") or "").lower())
    if entry:
        return entry["category"], ["neetcode150"]

    # Not on a curated list — derive a category from the problem's own tags.
    tags = problem.get("topicTags") or []
    if tags and isinstance(tags[0], dict):
        tags = [t.get("name", "") for t in tags]
    category = next((t for t in tags if t), "Algorithms")
    return category, []
