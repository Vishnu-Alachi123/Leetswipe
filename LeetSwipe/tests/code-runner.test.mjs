/**
 * Tests for the on-device code runner.
 *
 *     npm test        (or: node --test tests/code-runner.test.mjs)
 *
 * The runner is the one piece of the app that executes text the learner typed,
 * so its guarantees are worth pinning down: an infinite loop must not freeze the
 * app, and instrumentation must never alter the meaning of correct code.
 *
 * esbuild strips the types up front rather than adding a TS test runner to the
 * project — the module is pure logic with no React Native imports, so it runs
 * under plain node once the annotations are gone.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = join(mkdtempSync(join(tmpdir(), 'leetswipe-')), 'code-runner.mjs');

execFileSync(
  'npx',
  ['esbuild', join(here, '..', 'api', 'code-runner.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`],
  { stdio: 'pipe' },
);

const { instrument, runTests } = await import(bundle);

const CASES = [
  { input: '[2,7,11,15], 9', expected: '[0,1]' },
  { input: '[3,2,4], 6', expected: '[1,2]' },
  { input: '[3,3], 6', expected: '[0,1]', note: 'duplicate values' },
];

const CORRECT = `
function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}`;

// ----------------------------------------------------------------- grading
test('a correct solution passes every case', () => {
  const r = runTests(CORRECT, 'twoSum', CASES);
  assert.equal(r.passed, true);
  assert.equal(r.cases.filter((c) => c.passed).length, 3);
});

test('a wrong solution reports which case failed, not just "wrong"', () => {
  const r = runTests(
    `function twoSum(nums, target) {
       for (let i = 0; i < nums.length; i++)
         for (let j = i + 1; j < nums.length; j++)
           if (nums[i] + nums[j] === target && nums[i] !== nums[j]) return [i, j];
       return [];
     }`,
    'twoSum',
    CASES,
  );
  assert.equal(r.passed, false);
  const failed = r.cases.filter((c) => !c.passed);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].input, '[3,3], 6');
  assert.equal(failed[0].note, 'duplicate values');
});

test('results compare structurally, not by reference', () => {
  const r = runTests('function f() { return [{ a: [1, 2] }]; }', 'f', [
    { input: '', expected: '[{ a: [1, 2] }]' },
  ]);
  assert.equal(r.passed, true);
});

test('a syntax error is reported once, not per case', () => {
  const r = runTests('function twoSum( {{{', 'twoSum', CASES);
  assert.equal(r.passed, false);
  assert.ok(r.error);
  assert.equal(r.cases.length, 0);
});

test('a missing function is named in the error', () => {
  const r = runTests('function somethingElse() {}', 'twoSum', CASES);
  assert.match(r.error, /twoSum/);
});

test('a throwing case fails only that case', () => {
  const r = runTests(
    'function twoSum(nums) { if (nums.length === 2) throw new Error("boom"); return [0,1]; }',
    'twoSum',
    CASES,
  );
  assert.equal(r.cases.filter((c) => c.error).length, 1);
  assert.equal(r.cases.filter((c) => c.passed).length, 1);
});

test('no test cases is not a pass', () => {
  assert.equal(runTests('function f() {}', 'f', []).passed, false);
});

// ------------------------------------------------------------ loop budget
test('an infinite while loop is stopped', () => {
  const started = Date.now();
  const r = runTests('function twoSum() { while (true) {} }', 'twoSum', CASES);
  assert.equal(r.passed, false);
  assert.match(r.cases[0].error, /infinite loop/);
  assert.ok(Date.now() - started < 5000, 'guard must fire quickly');
});

test('an infinite for loop is stopped', () => {
  const r = runTests('function twoSum() { for (;;) {} }', 'twoSum', CASES);
  assert.match(r.cases[0].error, /infinite loop/);
});

test('an infinite loop with no braces is stopped', () => {
  const r = runTests('function twoSum() { let i = 0; while (i < 10) i = i; }', 'twoSum', CASES);
  assert.match(r.cases[0].error, /infinite loop/);
});

test('an infinite do-while is stopped', () => {
  const r = runTests('function twoSum() { do {} while (true); }', 'twoSum', CASES);
  assert.match(r.cases[0].error, /infinite loop/);
});

test('a legitimately long loop still completes', () => {
  const r = runTests(
    'function f() { let s = 0; for (let i = 0; i < 200000; i++) s += i; return s; }',
    'f',
    [{ input: '', expected: '19999900000' }],
  );
  assert.equal(r.passed, true);
});

// --------------------------------------------------------- instrumentation
test('loop keywords inside strings are left alone', () => {
  const src = 'const s = "for (;;) while"; const t = `while (x)`;';
  assert.equal(instrument(src), src);
});

test('loop keywords inside comments are left alone', () => {
  const src = '// for (;;) while\n/* while (true) */';
  assert.equal(instrument(src), src);
});

test('identifiers containing a loop keyword are left alone', () => {
  const src = 'const format = 1; const somewhile = 2; formatter();';
  assert.equal(instrument(src), src);
});

test('string contents survive instrumentation at runtime', () => {
  const r = runTests('function f() { return "} while (x)"; }', 'f', [
    { input: '', expected: '"} while (x)"' },
  ]);
  assert.equal(r.passed, true);
});

test('a do-while keeps its meaning', () => {
  // Regression: the trailing `while` of a do-while was being treated as a new
  // loop and given a body, which changed the parse.
  const r = runTests(
    'function f() { let i = 0, s = 0; do { s += i; i++; } while (i < 5); return s; }',
    'f',
    [{ input: '', expected: '10' }],
  );
  assert.equal(r.passed, true);
  assert.ok(!instrument('do { y(); } while (z);').includes('while (z){'));
});

test('nested do-while keeps its meaning', () => {
  const r = runTests(
    `function f() {
       let n = 0;
       do { let j = 0; do { j++; n++; } while (j < 3); } while (n < 9);
       return n;
     }`,
    'f',
    [{ input: '', expected: '9' }],
  );
  assert.equal(r.passed, true);
});

test('a plain block before a while is still instrumented', () => {
  const out = instrument('{ a(); } while (z) { b(); }');
  assert.match(out, /while \(z\) \{__leetswipeTick/);
});

test('every loop form gets exactly one tick', () => {
  for (const src of [
    'for (let i=0;i<3;i++) { x(); }',
    'while (a < b) a++;',
    'for (const x of xs) { y(); }',
    'for (let i = f((a),(b)); i < g((c)); i++) { h(); }',
  ]) {
    const ticks = (instrument(src).match(/__leetswipeTick\(\)/g) || []).length;
    assert.equal(ticks, 1, `expected one tick in: ${src}`);
  }
});

// ------------------------------------------------------- shipped challenges
test('every shipped challenge is solvable and non-trivial', async () => {
  const { readFileSync } = await import('node:fs');
  const data = JSON.parse(
    readFileSync(join(here, '..', 'assets', 'data', 'challenges.json'), 'utf8'),
  );
  assert.ok(data.challenges.length > 0);

  for (const c of data.challenges) {
    const solved = runTests(c.solution, c.functionName, c.testCases);
    assert.equal(solved.passed, true, `reference solution fails for ${c.title}`);

    // Starter code must NOT pass, or the challenge is already done.
    const starter = runTests(c.starterCode, c.functionName, c.testCases);
    assert.equal(starter.passed, false, `starter code already passes for ${c.title}`);

    assert.ok(c.hints.length >= 1, `${c.title} has no hints`);
    assert.ok(c.testCases.length >= 3, `${c.title} has too few test cases`);
  }
});

// ------------------------------------------------- regressions, 2026-09-25
// Each of these is a bug that shipped. They were found by driving the
// challenge screen the way a learner uses it, so they are pinned here rather
// than left to be rediscovered from a bug report.

test('the loop budget is per test case, not per run', () => {
  // Was: one budget for the whole run, so a correct O(n) solution with several
  // large cases exhausted it partway down and every later case was reported as
  // an infinite loop — blaming the learner for a bug in the grader.
  const n = 300_000;
  const cases = Array.from({ length: 10 }, () => ({
    input: String(n),
    expected: String((n * (n - 1)) / 2),
  }));
  const r = runTests('function sumTo(x){let s=0;for(let i=0;i<x;i++){s+=i;}return s;}', 'sumTo', cases);
  assert.equal(r.passed, true, r.cases.find((c) => !c.passed)?.error);
});

test('an unbraced do-while survives instrumentation and still gets a tick', () => {
  // Was: emitted `do do i++; while(c){tick();;}` — valid code turned into a
  // syntax error, and the one loop shape with no tick in it at all.
  const src = 'function f(n){ let i=0; do i++; while(i<n); return i; }';
  assert.equal(
    (instrument(src).match(/__leetswipeTick\(\)/g) || []).length,
    1,
    instrument(src),
  );
  assert.equal(runTests(src, 'f', [{ input: '5', expected: '5' }]).passed, true);

  // And the tick has to actually stop it.
  const spin = runTests('function f(n){ let i=0; do i++; while(true); return i; }', 'f', [
    { input: '5', expected: '5' },
  ]);
  assert.match(spin.cases[0].error ?? '', /infinite loop|too long/);
});

test('a do-while tail is never given a body of its own', () => {
  // Was: an inner `depth` shadowed the brace counter, so the closing
  // `while (...)` picked up a stray `{tick();}` block.
  const out = instrument(
    'function f(n){let k=0;do{for(let i=0;i<2;i++){k++;}k++;}while(k<n);return k;}',
  );
  assert.ok(!/while\s*\([^)]*\)\s*\{__leetswipeTick/.test(out), out);
});

test('compile errors name the cause rather than quoting the engine', () => {
  const at = (src, fn = 'twoSum') => runTests(src, fn, [{ input: '1', expected: '1' }]).error ?? '';

  assert.match(at(''), /editor is empty/i);
  assert.match(at('function twoSum(a){const s = “hi”; return a;}'), /curly double quotes/i);
  assert.match(at('function twosum(a){return a;}'), /capitalisation/i);
  assert.match(at('function solve(a){return a;}'), /defines solve/i);
  assert.match(at('function twoSum(a){ if (a) { return a;'), /unclosed brace/i);
});

test('one error shared by every case is reported once', () => {
  // `retrun [0]` parses (as indexing an undeclared name) and throws at call
  // time, which is the case that produces one identical error per test case.
  const r = runTests('function twoSum(a){ return retrun[0]; }', 'twoSum', [
    { input: '1', expected: '1' },
    { input: '2', expected: '2' },
  ]);
  assert.match(r.commonError ?? '', /retrun is not defined/);

  // A run where only some cases throw must NOT be collapsed — the second case
  // here simply returns the wrong number, which is a different kind of failure.
  const mixed = runTests('function twoSum(a){ return a.length; }', 'twoSum', [
    { input: 'null', expected: '1' },
    { input: '[1,2]', expected: '1' },
  ]);
  assert.equal(mixed.commonError, undefined);
  assert.ok(mixed.cases[0].error, 'first case should throw');
  assert.ok(!mixed.cases[1].error, 'second case should fail on value, not throw');
});

test('print, alert, confirm, prompt, open and close are sandboxed', () => {
  // On the web these are real, disruptive browser globals — `new Function`'s
  // scope chain falls back to `window` for any name not declared locally, so
  // an undeclared call reaches the real thing instead of throwing. The bug
  // that shipped: a learner writes `print(x)` out of Python habit to debug,
  // and the *browser's* print dialog opens once per test case the grader
  // runs their function against, instead of the ReferenceError they expect.
  for (const [name, hint] of [
    ['print', /Python|console\.log/i],
    ['alert', /blocks the whole app/i],
    ['confirm', /blocks the whole app/i],
    ['prompt', /waits for typed input/i],
    ['open', /new browser tab/i],
    ['close', /browser tab/i],
  ]) {
    const r = runTests(`function f(a){ ${name}(a); return a; }`, 'f', [{ input: '1', expected: '1' }]);
    assert.ok(r.cases[0].error, `${name}() should be caught, not silently succeed`);
    assert.match(r.cases[0].error, hint, `${name}: unexpected message "${r.cases[0].error}"`);
  }
});

test('a local variable legitimately named like a sandboxed global still works', () => {
  // The shadow is a function parameter, so ordinary lexical shadowing by the
  // learner's own declarations must still take priority — this is not about
  // banning the word "open", only about not falling through to the browser.
  const r = runTests(
    'function f(nums){ const open = nums.filter(n => n > 0); return open.length; }',
    'f',
    [{ input: '[1,-1,2]', expected: '2' }],
  );
  assert.equal(r.passed, true, r.cases[0]?.error);
});

test('qualified access (window.X, self.X, globalThis.X) is sandboxed too', () => {
  // Shadowing the bare name `print` stops `print()`, but not `window.print()`
  // — `window` itself was reachable and unshadowed, so the qualified form
  // reached the real function regardless. Confirmed live in a browser: before
  // this fix, `window.print()` inside a solution opened the real system print
  // dialog even though bare `print()` was already caught.
  for (const alias of ['window', 'self', 'globalThis', 'top', 'parent', 'frames']) {
    const r = runTests(`function f(a){ ${alias}.print(a); return a; }`, 'f', [
      { input: '1', expected: '1' },
    ]);
    assert.match(
      r.cases[0].error ?? '',
      /no access to the browser/i,
      `${alias}.print(): unexpected message "${r.cases[0].error}"`,
    );
  }
});

test('assigning to a bare, undeclared "location" does not navigate — it just becomes a local', () => {
  // Confirmed live in a browser: `location = x` with the `let`/`const` left
  // off (plausible in a grid/coordinate problem) navigated the whole tab away
  // via the real Location setter — no dialog, no way back, worse than print().
  // The fix makes `location` an ordinary (shadowed) local parameter, so the
  // assignment just sets that local and the function runs normally.
  const r = runTests(
    'function f(nums){ location = [nums[0], nums[1]]; return location; }',
    'f',
    [{ input: '[3,4]', expected: '[3,4]' }],
  );
  assert.equal(r.passed, true, r.cases[0]?.error);
});

test('bundled test-case expressions get the same sandboxing as learner code', () => {
  // testCase.expected/input are evaluated with new Function too, and until
  // now that eval had no shadowing at all — a bad generation run could in
  // principle produce a test case that reaches a real global directly, with
  // no defence whatsoever. The pipeline is LLM-authored, so "in principle"
  // is worth closing cheaply rather than trusting it never happens.
  const r = runTests('function f(a){ return a; }', 'f', [
    { input: 'print()', expected: '1' },
  ]);
  assert.match(r.cases[0].error ?? '', /no built-in print/i);
});
