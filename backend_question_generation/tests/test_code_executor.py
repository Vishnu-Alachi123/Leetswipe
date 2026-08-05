"""Tests for the Judge0 wrapper.

No network. Judge0 is stubbed at the transport boundary (`_submit` /
`_await_result`), which is what lets these run in CI without a key.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import code_executor  # noqa: E402
from code_executor import CaseResult, RunResult, is_configured, run_tests  # noqa: E402


@pytest.fixture
def keyed(monkeypatch):
    monkeypatch.setenv("JUDGE0_KEY", "test-key")


def stub_judge0(monkeypatch, outcomes):
    """Replace the two network calls with a scripted sequence of Judge0 payloads."""
    queue = list(outcomes)
    monkeypatch.setattr(code_executor, "_submit", lambda *a, **k: "token")
    monkeypatch.setattr(code_executor, "_await_result", lambda token: queue.pop(0))


def accepted(stdout="[0,1]"):
    return {"status": {"id": 3}, "stdout": stdout, "time": "0.05", "memory": 3200}


def wrong(stdout="[1,0]"):
    return {"status": {"id": 4}, "stdout": stdout, "time": "0.04", "memory": 3100}


def runtime_error(stderr="NameError"):
    return {"status": {"id": 11}, "stdout": "", "stderr": stderr, "time": "0.01"}


CASES = [{"input": "[2,7,11,15], 9", "expectedOutput": "[0,1]"}]


# --------------------------------------------------------------- configuration
def test_not_configured_without_key(monkeypatch):
    monkeypatch.delenv("JUDGE0_KEY", raising=False)
    assert not is_configured()


def test_configured_with_key(keyed):
    assert is_configured()


def test_missing_key_degrades_instead_of_raising(monkeypatch):
    monkeypatch.delenv("JUDGE0_KEY", raising=False)
    result = run_tests("python", "print(1)", CASES)
    assert not result.passed
    assert "JUDGE0_KEY" in result.error


def test_unsupported_language_reported(keyed):
    result = run_tests("brainfuck", "+++", CASES)
    assert "unsupported language" in result.error


# ------------------------------------------------------------------ outcomes
def test_all_cases_pass(keyed, monkeypatch):
    stub_judge0(monkeypatch, [accepted(), accepted()])
    result = run_tests("python", "print(x)", CASES * 2)
    assert result.passed
    assert result.passed_count == 2
    assert "2/2 test cases passed" in result.summary()


def test_failure_reported_per_case(keyed, monkeypatch):
    stub_judge0(monkeypatch, [accepted(), wrong()])
    result = run_tests("python", "print(x)", CASES * 2)
    assert not result.passed
    assert result.passed_count == 1
    assert result.cases[1].actual == "[1,0]"


def test_trailing_whitespace_still_passes(keyed, monkeypatch):
    """Judge0 marks a trailing newline as a mismatch. Nobody should fail for that."""
    stub_judge0(monkeypatch, [wrong(stdout="[0,1]\n  ")])
    result = run_tests("python", "print(x)", CASES)
    assert result.passed


def test_genuine_mismatch_still_fails(keyed, monkeypatch):
    stub_judge0(monkeypatch, [wrong(stdout="[9,9]")])
    assert not run_tests("python", "print(x)", CASES).passed


def test_runtime_error_captured(keyed, monkeypatch):
    stub_judge0(monkeypatch, [runtime_error()])
    result = run_tests("python", "print(undefined)", CASES)
    assert not result.passed
    assert "NameError" in result.cases[0].stderr
    assert "runtime error" in result.cases[0].status


def test_stop_on_first_failure(keyed, monkeypatch):
    stub_judge0(monkeypatch, [wrong(), accepted()])
    result = run_tests("python", "print(x)", CASES * 2, stop_on_first_failure=True)
    assert len(result.cases) == 1


def test_service_failure_becomes_error_not_exception(keyed, monkeypatch):
    """A grading outage must degrade, not take the request down."""
    def boom(*a, **k):
        raise code_executor.Judge0Error("gateway timeout")

    monkeypatch.setattr(code_executor, "_submit", boom)
    result = run_tests("python", "print(1)", CASES)
    assert not result.passed
    assert "gateway timeout" in result.error


def test_timing_is_converted_to_milliseconds(keyed, monkeypatch):
    stub_judge0(monkeypatch, [accepted()])
    assert run_tests("python", "print(1)", CASES).cases[0].time_ms == 50


def test_empty_test_list_is_not_a_pass(keyed, monkeypatch):
    stub_judge0(monkeypatch, [])
    assert not run_tests("python", "print(1)", []).passed


# -------------------------------------------------------------- hidden cases
def test_hidden_case_payload_is_redacted():
    case = CaseResult(passed=False, input="secret", expected="42", actual="7", hidden=True)
    red = case.redacted()
    assert red.input == "(hidden)" and red.expected == "(hidden)"
    assert "secret" not in (red.input + red.expected + red.actual)


def test_visible_case_is_untouched():
    case = CaseResult(passed=True, input="[1]", expected="1", actual="1")
    assert case.redacted() is case


def test_hidden_case_still_reports_pass_state():
    assert CaseResult(passed=True, hidden=True).redacted().passed


# ------------------------------------------------------------ solution check
def test_verify_solution_runs_the_reference(keyed, monkeypatch):
    from schema import CodeQuestion, TestCase

    stub_judge0(monkeypatch, [accepted()])
    question = CodeQuestion(
        questionId="two-sum-py", title="Two Sum", problemStatement="...",
        language="python", starterCode="# TODO", solution="print([0,1])",
        testCases=[TestCase(input="[2,7,11,15], 9", expectedOutput="[0,1]")],
        hints=["h1"], explanation="...", difficulty="Easy",
    )
    assert code_executor.verify_solution(question).passed


def test_run_result_summary_reports_service_error():
    assert "could not run" in RunResult(error="no key").summary()
