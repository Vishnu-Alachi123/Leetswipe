"""Run submitted code against a question's test cases.

Backed by Judge0 (https://judge0.com), which is the pragmatic choice here: the
alternative is executing arbitrary user code in our own process, which is not
something an app with a public API gets to do.

Configuration (environment):
    JUDGE0_URL     base URL. Defaults to the RapidAPI host.
    JUDGE0_KEY     API key. Without it, `is_configured()` is False and callers
                   should degrade to showing the reference solution rather than
                   grading.
    JUDGE0_HOST    RapidAPI host header, when using the RapidAPI gateway.

The module is import-safe with no key set — nothing here reaches the network
until you call `run_tests`.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

DEFAULT_URL = "https://judge0-ce.p.rapidapi.com"

# Judge0 language ids. Stable across deployments of the CE image.
LANGUAGE_IDS: dict[str, int] = {
    "python": 71,      # Python 3.8.1
    "javascript": 63,  # Node.js 12.14.0
    "java": 62,        # Java OpenJDK 13.0.1
}

# Judge0 status ids worth naming. 3 is the only success.
_ACCEPTED = 3
_STATUS = {
    1: "queued", 2: "processing", 3: "accepted", 4: "wrong answer",
    5: "time limit exceeded", 6: "compilation error", 7: "runtime error (SIGSEGV)",
    8: "runtime error (SIGXFSZ)", 9: "runtime error (SIGFPE)",
    10: "runtime error (SIGABRT)", 11: "runtime error (NZEC)", 12: "runtime error",
    13: "internal error", 14: "exec format error",
}

# A submission that has not settled after this many seconds is abandoned. Judge0
# queues under load, and a hung poll is worse than a reported timeout.
POLL_TIMEOUT_SECONDS = 20.0
POLL_INTERVAL_SECONDS = 0.4


class Judge0Error(RuntimeError):
    """The grading service failed — distinct from the submission failing."""


def is_configured() -> bool:
    """True when a key is present. Check before offering to grade anything."""
    return bool(os.environ.get("JUDGE0_KEY"))


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("JUDGE0_KEY")
    if key:
        # The RapidAPI gateway and a self-hosted instance disagree on the header
        # name, so send both; each ignores the one it does not know.
        headers["X-RapidAPI-Key"] = key
        headers["X-Auth-Token"] = key
    host = os.environ.get("JUDGE0_HOST")
    if host:
        headers["X-RapidAPI-Host"] = host
    return headers


def _post(path: str, payload: Mapping[str, Any]) -> dict[str, Any]:
    import urllib.error
    import urllib.request

    base = os.environ.get("JUDGE0_URL", DEFAULT_URL).rstrip("/")
    request = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers=_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Judge0Error(f"submit failed: HTTP {e.code} {e.reason}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise Judge0Error(f"submit failed: {e}") from e


def _get(path: str) -> dict[str, Any]:
    import urllib.error
    import urllib.request

    base = os.environ.get("JUDGE0_URL", DEFAULT_URL).rstrip("/")
    request = urllib.request.Request(f"{base}{path}", headers=_headers(), method="GET")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Judge0Error(f"poll failed: HTTP {e.code} {e.reason}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise Judge0Error(f"poll failed: {e}") from e


@dataclass
class CaseResult:
    """Outcome of one test case."""

    passed: bool
    input: str = ""
    expected: str = ""
    actual: str = ""
    status: str = ""
    stderr: str = ""
    compile_output: str = ""
    time_ms: int = 0
    memory_kb: int = 0
    hidden: bool = False

    def redacted(self) -> "CaseResult":
        """Strip the payload of a hidden case so the client cannot mine it."""
        if not self.hidden:
            return self
        return CaseResult(
            passed=self.passed, status=self.status, hidden=True,
            time_ms=self.time_ms, memory_kb=self.memory_kb,
            input="(hidden)", expected="(hidden)",
            actual="(hidden)" if not self.passed else "",
        )


@dataclass
class RunResult:
    """Outcome of a whole submission."""

    passed: bool = False
    cases: list[CaseResult] = field(default_factory=list)
    error: str = ""

    @property
    def passed_count(self) -> int:
        return sum(1 for c in self.cases if c.passed)

    def summary(self) -> str:
        if self.error:
            return f"could not run: {self.error}"
        return f"{self.passed_count}/{len(self.cases)} test cases passed"


def _normalise(text: str) -> str:
    """Compare outputs the way a human would: ignore trailing whitespace and
    line-ending differences, keep everything else."""
    return "\n".join(line.rstrip() for line in (text or "").strip().splitlines())


def _submit(language_id: int, source: str, stdin: str, expected: str) -> str:
    body = {
        "language_id": language_id,
        "source_code": source,
        "stdin": stdin,
        "expected_output": expected,
    }
    response = _post("/submissions?base64_encoded=false&wait=false", body)
    token = response.get("token")
    if not token:
        raise Judge0Error(f"no token in response: {response}")
    return str(token)


def _await_result(token: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    delay = POLL_INTERVAL_SECONDS
    while time.monotonic() < deadline:
        result = _get(f"/submissions/{token}?base64_encoded=false")
        status_id = (result.get("status") or {}).get("id", 0)
        if status_id > 2:  # anything past "processing" is settled
            return result
        time.sleep(delay)
        delay = min(delay * 1.5, 2.0)  # back off; Judge0 queues under load
    raise Judge0Error(f"submission {token} did not settle within {POLL_TIMEOUT_SECONDS:.0f}s")


def run_tests(
    language: str,
    source: str,
    test_cases: Sequence[Any],
    *,
    stop_on_first_failure: bool = False,
) -> RunResult:
    """Execute `source` once per test case and report what passed.

    Args:
        language: one of `LANGUAGE_IDS`.
        source: the complete program. It must read its input from stdin and
            print its result — that is the contract `starterCode` sets up.
        test_cases: `TestCase` models or dicts with `input` / `expectedOutput`.
        stop_on_first_failure: return as soon as a case fails. Useful for the
            "Run" button; leave off for "Submit", where the full report matters.

    Returns:
        A `RunResult`. Service failures land in `.error` rather than raising, so
        a grading outage degrades to "we could not run this" instead of a 500.
    """
    if language not in LANGUAGE_IDS:
        return RunResult(error=f"unsupported language {language!r}")
    if not is_configured():
        return RunResult(error="JUDGE0_KEY is not set; code execution is disabled")

    language_id = LANGUAGE_IDS[language]
    results: list[CaseResult] = []

    for case in test_cases:
        data = case.model_dump() if hasattr(case, "model_dump") else dict(case)
        stdin = str(data.get("input", ""))
        expected = str(data.get("expectedOutput", ""))
        hidden = bool(data.get("hidden", False))

        try:
            outcome = _await_result(_submit(language_id, source, stdin, expected))
        except Judge0Error as e:
            return RunResult(passed=False, cases=results, error=str(e))

        status_id = (outcome.get("status") or {}).get("id", 0)
        actual = outcome.get("stdout") or ""
        # Judge0's own comparison is whitespace-sensitive, so re-check ourselves
        # rather than failing someone over a trailing newline.
        passed = status_id == _ACCEPTED or (
            status_id == 4 and _normalise(actual) == _normalise(expected)
        )
        results.append(CaseResult(
            passed=passed,
            input=stdin,
            expected=expected,
            actual=actual,
            status=_STATUS.get(status_id, f"status {status_id}"),
            stderr=outcome.get("stderr") or "",
            compile_output=outcome.get("compile_output") or "",
            time_ms=int(float(outcome.get("time") or 0) * 1000),
            memory_kb=int(outcome.get("memory") or 0),
            hidden=hidden,
        ))
        if not passed and stop_on_first_failure:
            break

    return RunResult(passed=bool(results) and all(c.passed for c in results), cases=results)


def verify_solution(question: Any) -> RunResult:
    """Run a `CodeQuestion`'s own reference solution against its test cases.

    Generated code questions are worthless if the answer key is wrong, so the
    generator runs this before shipping one.
    """
    data = question.model_dump() if hasattr(question, "model_dump") else dict(question)
    return run_tests(
        str(data.get("language", "python")),
        str(data.get("solution", "")),
        data.get("testCases") or [],
    )
