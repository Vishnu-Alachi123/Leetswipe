#!/usr/bin/env python3
"""Hand-authored algorithm reels.

These ship with the app rather than being generated, for three reasons: the
Learn tab needs real content on day one, they are the few-shot examples the LLM
generator is calibrated against, and they pin down every visualisation shape the
renderer has to handle (array, pointers, queue, tree, table).

Written as code rather than raw JSON so the schema validates them at build time —
a malformed reel fails here instead of in the app.

    python seed_reels.py --out ../LeetSwipe/assets/data/reels.json
"""
from __future__ import annotations

import argparse
import json
import sys

from schema import AlgorithmReel, ReelSet, ReelStep, Visualization

# Roughly how fast a text-to-speech voice reads, used to estimate reel length.
WORDS_PER_SECOND = 2.6


# --------------------------------------------------------------- viz builders
def array(values, *, active=(), eliminated=(), found=(), visited=(), labels=None, caption=""):
    """An array row. `labels` maps index -> pointer name shown under the cell."""
    labels = labels or {}
    cells = []
    for i, v in enumerate(values):
        if i in found:
            status = "found"
        elif i in eliminated:
            status = "eliminated"
        elif i in active:
            status = "active"
        elif i in visited:
            status = "visited"
        else:
            status = "normal"
        cells.append({"value": v, "status": status, "label": labels.get(i, "")})
    return Visualization(kind="array", state={"cells": cells}, caption=caption)


def table(columns, rows, *, highlight=None, caption=""):
    return Visualization(
        kind="table",
        state={"columns": list(columns), "rows": [list(r) for r in rows],
               "highlight": highlight if highlight is not None else -1},
        caption=caption,
    )


def queue_viz(items, *, caption="", processing=None):
    cells = [{"value": v, "status": "active" if v == processing else "normal", "label": ""}
             for v in items]
    return Visualization(kind="queue", state={"cells": cells}, caption=caption)


def tree(nodes, edges, *, caption=""):
    """`nodes` is [(id, value, status)], `edges` is [(from, to, status)]."""
    return Visualization(
        kind="tree",
        state={
            "nodes": [{"id": n, "value": v, "status": s} for n, v, s in nodes],
            "edges": [{"from": a, "to": b, "status": s} for a, b, s in edges],
        },
        caption=caption,
    )


def step(n, code, explanation, audio, viz, *, lines=()):
    return ReelStep(
        stepNumber=n, code=code, highlightLines=list(lines),
        explanation=explanation, audioScript=audio, visualization=viz,
    )


# ------------------------------------------------------------------ the reels
def binary_search() -> AlgorithmReel:
    values = [2, 5, 8, 12, 16, 23, 38, 56]
    code = """def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1"""
    return AlgorithmReel(
        reelId="binary-search-py",
        algorithmName="Binary Search",
        description="Find a value in a sorted array by halving the search space every comparison.",
        hook="Find one item among 4 billion in 32 guesses.",
        language="python",
        fullCode=code,
        difficulty="Easy",
        topics=["Binary Search", "Array"],
        category="Binary Search",
        lists=["neetcode150"],
        sourceSlug="binary-search",
        timeComplexity="O(log n)",
        spaceComplexity="O(1)",
        steps=[
            step(1, "lo, hi = 0, len(nums) - 1",
                 "Two pointers mark the range still worth searching — initially the whole array.",
                 "We're looking for twenty-three in this sorted array. Two markers fence off the region that could still contain it. Low starts at the far left, high at the far right, so right now everything is in play.",
                 array(values, labels={0: "lo", 7: "hi"}, caption="Search range: the whole array"),
                 lines=[2]),
            step(2, "mid = (lo + hi) // 2",
                 "Look at the middle of the current range. Index (0 + 7) // 2 = 3.",
                 "Instead of checking items one by one, we jump straight to the middle. Zero plus seven, halved and rounded down, gives index three. That's the value twelve.",
                 array(values, active=[3], labels={0: "lo", 3: "mid", 7: "hi"},
                       caption="mid = 3 → nums[3] = 12"),
                 lines=[4]),
            step(3, "if nums[mid] < target:  # 12 < 23",
                 "12 is smaller than 23, so the answer cannot be at mid or anywhere left of it.",
                 "Twelve is less than twenty-three. Because the array is sorted, everything to the left of twelve is also less than twenty-three. That entire half is now impossible, so we discard it in one move.",
                 array(values, eliminated=[0, 1, 2, 3], labels={4: "lo", 7: "hi"},
                       caption="Half the array eliminated in one comparison"),
                 lines=[7]),
            step(4, "lo = mid + 1",
                 "Move the low pointer past mid. The live range is now indices 4 through 7.",
                 "So we slide the low marker to just past the middle. Four candidates remain where there were eight. That halving is the whole trick.",
                 array(values, eliminated=[0, 1, 2, 3], labels={4: "lo", 7: "hi"},
                       caption="4 candidates left"),
                 lines=[8]),
            step(5, "mid = (4 + 7) // 2  # 5",
                 "Same move on the smaller range: the midpoint is now index 5, holding 23.",
                 "We repeat the exact same step on what's left. Four plus seven, halved, is index five. That happens to hold twenty-three.",
                 array(values, eliminated=[0, 1, 2, 3], active=[5],
                       labels={4: "lo", 5: "mid", 7: "hi"}, caption="mid = 5 → nums[5] = 23"),
                 lines=[4]),
            step(6, "if nums[mid] == target: return mid",
                 "Match. Return index 5.",
                 "It matches the target, so we return index five and stop. Eight elements, and we only ever looked at two of them.",
                 array(values, eliminated=[0, 1, 2, 3], found=[5], labels={5: "found"},
                       caption="Found at index 5 — 2 comparisons total"),
                 lines=[5, 6]),
            step(7, "# why O(log n)",
                 "Each comparison discards half of what remains, so the work grows with the number of halvings, not the size.",
                 "Every comparison throws away half the remaining candidates. Doubling the array adds just one extra step. That's why a list of four billion items needs only about thirty-two comparisons.",
                 table(["array size", "comparisons"],
                       [["8", "3"], ["1,000", "10"], ["1,000,000", "20"], ["4,000,000,000", "32"]],
                       highlight=3, caption="Doubling the input costs one more step"),
                 lines=[3]),
        ],
    )


def two_pointers() -> AlgorithmReel:
    values = ["r", "a", "c", "e", "c", "a", "r"]
    code = """def is_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True"""
    return AlgorithmReel(
        reelId="two-pointers-palindrome-py",
        algorithmName="Two Pointers",
        description="Walk inward from both ends of a sequence to compare pairs without extra memory.",
        hook="Check a palindrome without copying a single character.",
        language="python",
        fullCode=code,
        difficulty="Easy",
        topics=["Two Pointers", "String"],
        category="Two Pointers",
        lists=["neetcode150"],
        sourceSlug="valid-palindrome",
        timeComplexity="O(n)",
        spaceComplexity="O(1)",
        steps=[
            step(1, "left, right = 0, len(s) - 1",
                 "Start one pointer at each end of the string.",
                 "The obvious way to check a palindrome is to reverse the string and compare. That works, but it copies the whole thing. Instead we place one finger on the first character and one on the last.",
                 array(values, labels={0: "left", 6: "right"}, caption="Pointers at both ends"),
                 lines=[2]),
            step(2, "if s[left] != s[right]: return False",
                 "Compare the outermost pair. 'r' equals 'r', so the string is still a candidate.",
                 "We compare the two characters under our fingers. Both are r, so this pair is fine and we keep going.",
                 array(values, active=[0, 6], labels={0: "left", 6: "right"},
                       caption="'r' == 'r' ✓"),
                 lines=[4, 5]),
            step(3, "left += 1; right -= 1",
                 "Step both pointers inward. They now sit on 'a' and 'a'.",
                 "Now both fingers move one step toward the centre. The characters they land on are a and a, which match again.",
                 array(values, visited=[0, 6], active=[1, 5], labels={1: "left", 5: "right"},
                       caption="'a' == 'a' ✓"),
                 lines=[6, 7]),
            step(4, "# third pair",
                 "'c' and 'c' match. Two characters remain between the pointers.",
                 "Third pair, c and c. Notice we've checked six characters while storing nothing but two numbers.",
                 array(values, visited=[0, 1, 5, 6], active=[2, 4], labels={2: "left", 4: "right"},
                       caption="'c' == 'c' ✓"),
                 lines=[4]),
            step(5, "while left < right:  # 3 < 3 is False",
                 "The pointers have met in the middle. Every pair has been checked.",
                 "The fingers meet on the middle character. There's nothing left to pair it with, so the loop condition fails and we're done.",
                 array(values, visited=[0, 1, 2, 4, 5, 6], active=[3], labels={3: "left=right"},
                       caption="Pointers met — every pair checked"),
                 lines=[3]),
            step(6, "return True",
                 "No mismatch was ever found, so the string reads the same both ways.",
                 "We never found a mismatch, so it's a palindrome. One pass, and the extra memory used was two integers regardless of how long the string is.",
                 array(values, found=list(range(7)), caption="Palindrome ✓ — O(1) extra space"),
                 lines=[8]),
        ],
    )


def sliding_window() -> AlgorithmReel:
    values = ["a", "b", "c", "a", "b", "c", "b", "b"]
    code = """def longest_unique(s):
    seen = set()
    left = best = 0
    for right in range(len(s)):
        while s[right] in seen:
            seen.remove(s[left])
            left += 1
        seen.add(s[right])
        best = max(best, right - left + 1)
    return best"""
    return AlgorithmReel(
        reelId="sliding-window-py",
        algorithmName="Sliding Window",
        description="Keep a moving range over the input, growing it on the right and shrinking it on the left, so each element is handled once.",
        hook="Turn a nested loop into a single pass.",
        language="python",
        fullCode=code,
        difficulty="Medium",
        topics=["Sliding Window", "Hash Set", "String"],
        category="Sliding Window",
        lists=["neetcode150"],
        sourceSlug="longest-substring-without-repeating-characters",
        timeComplexity="O(n)",
        spaceComplexity="O(k)",
        steps=[
            step(1, "seen = set(); left = best = 0",
                 "The window spans left..right and `seen` holds exactly the characters inside it.",
                 "We want the longest stretch with no repeated characters. Checking every possible substring would be quadratic. Instead we maintain one window and a set of what's inside it.",
                 array(values, caption="Window empty, about to grow"),
                 lines=[2, 3]),
            step(2, "for right in ...: seen.add(s[right])",
                 "Grow the window rightward while characters stay unique. a, b, c are all new.",
                 "The right edge advances, pulling characters into the window. A, then b, then c — all new, so the window keeps growing. Length is three.",
                 array(values, active=[0, 1, 2], labels={0: "left", 2: "right"},
                       caption="window = 'abc', length 3"),
                 lines=[4, 8]),
            step(3, "while s[right] in seen:",
                 "The next character is 'a', which is already inside the window. The window must shrink.",
                 "Now the right edge hits another a. That a is already in our window, so the window is no longer valid and we have to shrink it from the left.",
                 array(values, active=[0, 1, 2], eliminated=[3], labels={0: "left", 3: "right"},
                       caption="'a' already in window — conflict"),
                 lines=[5]),
            step(4, "seen.remove(s[left]); left += 1",
                 "Drop the leftmost character and advance left, which clears the duplicate.",
                 "We remove the character at the left edge and slide that edge forward. That drops the old a, so the new one can join. Crucially, the left edge only ever moves forward.",
                 array(values, visited=[0], active=[1, 2, 3], labels={1: "left", 3: "right"},
                       caption="window = 'bca', still length 3"),
                 lines=[6, 7]),
            step(5, "best = max(best, right - left + 1)",
                 "The window keeps sliding, and the best length seen so far is recorded at each step.",
                 "The window continues sliding across the string, and after each move we record its size if it's the biggest yet. The answer is that running maximum.",
                 array(values, visited=[0, 1], active=[2, 3, 4], labels={2: "left", 4: "right"},
                       caption="window = 'cab', best = 3"),
                 lines=[9]),
            step(6, "# each index moves forward only",
                 "Both edges only ever advance, so every character enters and leaves the window at most once.",
                 "Here's why this is linear rather than quadratic. Each edge only ever moves right, so every character is added once and removed at most once. Two pointers crossing the string once, not a loop inside a loop.",
                 table(["approach", "time", "work on n = 1000"],
                       [["check every substring", "O(n²)", "1,000,000"],
                        ["sliding window", "O(n)", "1,000"]],
                       highlight=1, caption="Same answer, a thousand times less work"),
                 lines=[4, 5]),
        ],
    )


def bfs() -> AlgorithmReel:
    code = """from collections import deque

def bfs(graph, start):
    seen = {start}
    q = deque([start])
    while q:
        node = q.popleft()
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)"""
    return AlgorithmReel(
        reelId="bfs-py",
        algorithmName="Breadth-First Search",
        description="Explore a graph level by level using a queue, which finds the shortest path in an unweighted graph.",
        hook="Why a queue finds the shortest route and a stack doesn't.",
        language="python",
        fullCode=code,
        difficulty="Medium",
        topics=["BFS", "Graph", "Queue"],
        category="Graphs",
        lists=["neetcode150"],
        sourceSlug="clone-graph",
        timeComplexity="O(V + E)",
        spaceComplexity="O(V)",
        steps=[
            step(1, "seen = {start}; q = deque([start])",
                 "Start at node A. The queue holds what to visit next; `seen` prevents revisiting.",
                 "We start at node A. A queue tracks what to visit next, and a set remembers where we've already been so cycles can't trap us.",
                 tree([("A", "A", "active"), ("B", "B", "normal"), ("C", "C", "normal"),
                       ("D", "D", "normal"), ("E", "E", "normal")],
                      [("A", "B", "normal"), ("A", "C", "normal"),
                       ("B", "D", "normal"), ("C", "E", "normal")],
                      caption="Queue: [A]"),
                 lines=[4, 5]),
            step(2, "node = q.popleft()",
                 "Take A off the front of the queue and look at its neighbours.",
                 "We pull A off the front of the queue. Taking from the front is the detail that makes this breadth-first — we'll come back to that.",
                 queue_viz(["A"], processing="A", caption="Processing A"),
                 lines=[7]),
            step(3, "for nxt in graph[node]: q.append(nxt)",
                 "A's neighbours B and C join the back of the queue. Both are one step from the start.",
                 "A's neighbours, B and C, go onto the back of the queue. Both sit exactly one step from the start.",
                 tree([("A", "A", "visited"), ("B", "B", "active"), ("C", "C", "active"),
                       ("D", "D", "normal"), ("E", "E", "normal")],
                      [("A", "B", "visited"), ("A", "C", "visited"),
                       ("B", "D", "normal"), ("C", "E", "normal")],
                      caption="Queue: [B, C] — distance 1"),
                 lines=[8, 11]),
            step(4, "# B comes off before D goes on",
                 "Because the queue is first-in-first-out, every node at distance 1 is processed before any node at distance 2.",
                 "Here's the key. Because we always take from the front and add to the back, everything one step away is handled before anything two steps away. The search expands in rings.",
                 queue_viz(["B", "C"], processing="B", caption="FIFO: distance 1 finishes first"),
                 lines=[6, 7]),
            step(5, "if nxt not in seen: seen.add(nxt)",
                 "D and E are discovered at distance 2 and appended behind the distance-1 nodes.",
                 "Processing B and C uncovers D and E, two steps out. They queue up behind everything closer, preserving the ordering.",
                 tree([("A", "A", "visited"), ("B", "B", "visited"), ("C", "C", "visited"),
                       ("D", "D", "active"), ("E", "E", "active")],
                      [("A", "B", "visited"), ("A", "C", "visited"),
                       ("B", "D", "visited"), ("C", "E", "visited")],
                      caption="Queue: [D, E] — distance 2"),
                 lines=[9, 10, 11]),
            step(6, "# queue vs stack",
                 "Swap the queue for a stack and you get depth-first search, which dives down one branch and loses the shortest-path guarantee.",
                 "Change one thing — take from the back instead of the front — and this becomes depth-first search. It still visits every node, but it dives down one branch first, so the first time it reaches a node is no longer by the shortest route.",
                 table(["structure", "order", "first arrival is shortest?"],
                       [["queue (FIFO)", "level by level", "yes"],
                        ["stack (LIFO)", "branch by branch", "no"]],
                       highlight=0, caption="One line of difference, a different algorithm"),
                 lines=[7]),
        ],
    )


def kadane() -> AlgorithmReel:
    values = [-2, 3, -1, 4, -5, 2]
    code = """def max_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return best"""
    return AlgorithmReel(
        reelId="kadane-py",
        algorithmName="Kadane's Algorithm",
        description="Find the highest-sum contiguous run by deciding, at each element, whether to extend the current run or start over.",
        hook="One decision per element solves maximum subarray.",
        language="python",
        fullCode=code,
        difficulty="Medium",
        topics=["Dynamic Programming", "Array"],
        category="1-D Dynamic Programming",
        lists=["neetcode150"],
        sourceSlug="maximum-subarray",
        timeComplexity="O(n)",
        spaceComplexity="O(1)",
        steps=[
            step(1, "best = cur = nums[0]",
                 "`cur` is the best run ending exactly here; `best` is the best run seen anywhere.",
                 "We track two numbers. Current is the best total for a run ending right where we're standing. Best is the highest total we've seen anywhere so far.",
                 array(values, active=[0], labels={0: "cur=-2"}, caption="cur = -2, best = -2"),
                 lines=[2]),
            step(2, "cur = max(x, cur + x)  # max(3, -2+3)",
                 "At 3, extending the previous run gives 1, but starting fresh gives 3. Start fresh.",
                 "At the value three we face the only decision this algorithm ever makes. Extend the previous run for a total of one, or abandon it and start fresh at three. Three wins, so we drop the negative history.",
                 array(values, visited=[0], active=[1], labels={1: "cur=3"},
                       caption="Start fresh: cur = 3, best = 3"),
                 lines=[4]),
            step(3, "# at -1: extend, because 3 + -1 = 2 beats -1",
                 "A negative number is worth carrying if the run behind it is strong enough.",
                 "Next comes negative one. Starting over would give negative one, but extending gives two. So we carry the loss, because the run behind it is strong enough to absorb it.",
                 array(values, visited=[0], active=[1, 2], labels={2: "cur=2"},
                       caption="Extend: cur = 2, best = 3"),
                 lines=[4]),
            step(4, "# at 4: cur = 2 + 4 = 6",
                 "Extending again gives 6, the best run found so far.",
                 "That patience pays off immediately. Adding four brings the current run to six, the best total yet, so best updates.",
                 array(values, visited=[0], active=[1, 2, 3], labels={3: "cur=6"},
                       caption="cur = 6, best = 6 ← answer"),
                 lines=[4, 5]),
            step(5, "# at -5: cur = 6 - 5 = 1, best stays 6",
                 "The run survives but weakens. `best` remembers the peak, so the drop is harmless.",
                 "A five-point drop knocks the current run down to one. But best already recorded six, so the peak is safely remembered even as the current run decays.",
                 array(values, visited=[0], active=[1, 2, 3, 4], labels={4: "cur=1"},
                       caption="cur = 1, best still 6"),
                 lines=[5]),
            step(6, "return best",
                 "The answer is 6, from the run [3, -1, 4].",
                 "The final element lifts the current run to three, still short of six. We return six, the sum of three, negative one, and four.",
                 array(values, found=[1, 2, 3], visited=[0, 4, 5],
                       caption="Answer: 6 from [3, -1, 4]"),
                 lines=[6]),
            step(7, "# why this is O(n)",
                 "Every element is visited once and only two numbers are stored, no matter how long the array is.",
                 "Checking every possible run would be quadratic. Kadane's asks one question per element — extend or restart — and stores just two numbers, so it's linear time and constant space.",
                 table(["approach", "time", "extra space"],
                       [["every subarray", "O(n²)", "O(1)"], ["Kadane's", "O(n)", "O(1)"]],
                       highlight=1, caption="Linear, with two variables"),
                 lines=[3, 4]),
        ],
    )


REELS = [binary_search, two_pointers, sliding_window, bfs, kadane]


def build() -> ReelSet:
    reels = []
    for make in REELS:
        reel = make()
        # Estimate playback from the narration, so the UI can show a duration
        # without anyone maintaining it by hand.
        words = sum(len(s.audioScript.split()) for s in reel.steps)
        reel.durationSeconds = max(15, round(words / WORDS_PER_SECOND))
        reel.source = "curated"
        reels.append(reel)
    return ReelSet(reels=reels)


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the curated algorithm reels.")
    ap.add_argument("--out", default="reels.json", help="Where to write the reel set.")
    args = ap.parse_args()

    reel_set = build()
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(reel_set.model_dump(), f, indent=2)

    total_steps = sum(len(r.steps) for r in reel_set.reels)
    print(f"Wrote {args.out}: {len(reel_set.reels)} reels, {total_steps} steps.")
    for r in reel_set.reels:
        kinds = sorted({s.visualization.kind for s in r.steps})
        print(f"  {r.algorithmName:24} {len(r.steps)} steps · ~{r.durationSeconds}s · {', '.join(kinds)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
