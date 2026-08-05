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
