/**
 * Runs a learner's JavaScript against a challenge's test cases, on the device.
 *
 * Why local rather than a hosted sandbox: the rest of the app works offline and
 * costs nothing per use, and a grading service would break both. The learner is
 * running their own code on their own device, which is the same trust model as
 * a browser console — the risk is not arbitrary code execution, it is an
 * accidental infinite loop freezing the UI.
 *
 * So the interesting part here is `instrument`, which injects a budget counter
 * into every loop body. JavaScript cannot interrupt a synchronous function, so
 * a `while (true) {}` in submitted code would otherwise hang the app with no
 * way back. Counting iterations from inside is the only reliable defence that
 * works on web and native alike.
 */

const TICK = '__leetswipeTick';

/** Iterations before a run is abandoned. Comfortably above any real solution. */
const TICK_BUDGET = 2_000_000;

/** Wall-clock ceiling, as a backstop for cheap non-looping pathologies. */
const TIME_BUDGET_MS = 2000;

export interface TestCase {
  /** Arguments as a JS expression, e.g. "[2,7,11,15], 9". */
  input: string;
  /** Expected return value as a JS expression, e.g. "[0,1]". */
  expected: string;
  /** Why this case exists. Revealed after a failure. */
  note?: string;
}

export interface CaseOutcome {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
  note?: string;
}

export interface RunOutcome {
  passed: boolean;
  cases: CaseOutcome[];
  /** Set when the code could not run at all — a syntax error, say. */
  error?: string;
  durationMs: number;
}

/**
 * Insert a budget check at the top of every loop body.
 *
 * Deliberately a small scanner rather than a regex: a regex cannot tell a `for`
 * inside a string literal from a real one, and would corrupt the source. This
 * walks the text tracking strings, template literals, and comments, so it only
 * rewrites loop keywords that are actually code.
 */
export function instrument(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;

  const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);

  // Brace depth, and the depths at which `do` bodies were opened. Needed to
  // recognise the `while` that *closes* a do-while: instrumenting that one
  // would attach a body to the condition and change what the code means.
  let depth = 0;
  const doBodyDepths: number[] = [];
  let expectDoWhile = false;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    // Skip over anything that is not executable text, copying it verbatim.
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === quote) break;
        j += 1;
      }
      out += source.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }

    // A loop keyword, only when it stands alone as a word.
    const rest = source.slice(i);
    const match = /^(for|while)\b/.exec(rest);
    const prev = i > 0 ? source[i - 1] : ' ';

    // The tail of a do-while: copy it through untouched. Its body was already
    // instrumented when the `do` was opened.
    if (match && match[1] === 'while' && expectDoWhile && !isIdentChar(prev)) {
      expectDoWhile = false;
      out += 'while';
      i += 5;
      continue;
    }

    if (match && !isIdentChar(prev)) {
      const keyword = match[1];
      // Walk past the header's parenthesised clause, respecting nesting.
      let j = i + keyword.length;
      while (j < n && /\s/.test(source[j])) j += 1;
      if (source[j] !== '(') {
        out += keyword;
        i += keyword.length;
        continue;
      }
      let depth = 0;
      let k = j;
      for (; k < n; k += 1) {
        if (source[k] === '(') depth += 1;
        else if (source[k] === ')') {
          depth -= 1;
          if (depth === 0) {
            k += 1;
            break;
          }
        }
      }
      out += source.slice(i, k);
      // Body may be a block or a single statement; handle both.
      let m = k;
      while (m < n && /\s/.test(source[m])) m += 1;
      out += source.slice(k, m);
      if (source[m] === '{') {
        out += `{${TICK}();`;
        depth += 1;
        i = m + 1;
      } else {
        // `while (x) doThing();` — wrap it so the tick has somewhere to live.
        out += `{${TICK}();`;
        let depthBrace = 0;
        let p = m;
        for (; p < n; p += 1) {
          if (source[p] === '(') depthBrace += 1;
          else if (source[p] === ')') depthBrace -= 1;
          else if (source[p] === ';' && depthBrace === 0) {
            p += 1;
            break;
          }
        }
        out += source.slice(m, p) + '}';
        i = p;
      }
      continue;
    }

    // `do { ... } while (...)` — the body precedes the header.
    const doMatch = /^do\b/.exec(rest);
    if (doMatch && !isIdentChar(prev)) {
      let j = i + 2;
      while (j < n && /\s/.test(source[j])) j += 1;
      out += source.slice(i, j);
      if (source[j] === '{') {
        out += `{${TICK}();`;
        depth += 1;
        // Remember the depth *inside* this body, so its closing brace can be
        // recognised and the `while` that follows left alone.
        doBodyDepths.push(depth);
        i = j + 1;
      } else {
        out += 'do';
        i += 2;
      }
      continue;
    }

    if (c === '{') depth += 1;
    if (c === '}') {
      if (doBodyDepths.length && doBodyDepths[doBodyDepths.length - 1] === depth) {
        doBodyDepths.pop();
        expectDoWhile = true;
      }
      depth -= 1;
    } else if (!/\s/.test(c)) {
      // Anything other than whitespace between `}` and `while` means this is a
      // plain block, not a do-while.
      expectDoWhile = false;
    }

    out += c;
    i += 1;
  }

  return out;
}

function serialize(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Structural equality, so [0,1] from the learner matches [0,1] from the test. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      )
    );
  }
  // NaN is the one value that is not equal to itself; treat matching NaNs as equal.
  return Number.isNaN(a as number) && Number.isNaN(b as number);
}

/**
 * Build a callable from the learner's source.
 *
 * `new Function` rather than `eval` so the body cannot reach this module's
 * scope, and the tick function is passed in explicitly.
 */
function compile(source: string, functionName: string): (...args: unknown[]) => unknown {
  const instrumented = instrument(source);
  const factory = new Function(
    TICK,
    `"use strict";\n${instrumented}\nreturn typeof ${functionName} === "function" ? ${functionName} : null;`,
  );

  let ticks = 0;
  const start = Date.now();
  const tick = () => {
    ticks += 1;
    if (ticks > TICK_BUDGET) {
      throw new Error('Your code ran too many loop iterations — is there an infinite loop?');
    }
    // Checking the clock on every iteration would dominate the runtime, so
    // sample it instead.
    if ((ticks & 0x3fff) === 0 && Date.now() - start > TIME_BUDGET_MS) {
      throw new Error('Your code took too long to finish.');
    }
  };

  const fn = factory(tick);
  if (typeof fn !== 'function') {
    throw new Error(`No function named ${functionName} was defined.`);
  }
  return fn as (...args: unknown[]) => unknown;
}

/**
 * Run `source` against every test case.
 *
 * A failure to compile lands in `error`; a failure in one case lands on that
 * case, so the learner sees which input broke rather than a blanket "wrong".
 */
export function runTests(
  source: string,
  functionName: string,
  cases: TestCase[],
): RunOutcome {
  const started = Date.now();

  let fn: (...args: unknown[]) => unknown;
  try {
    fn = compile(source, functionName);
  } catch (e) {
    return {
      passed: false,
      cases: [],
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    };
  }

  const outcomes: CaseOutcome[] = cases.map((testCase) => {
    let expected: unknown;
    try {
      expected = new Function(`"use strict"; return (${testCase.expected});`)();
    } catch {
      expected = testCase.expected;
    }

    try {
      const args = new Function(`"use strict"; return [${testCase.input}];`)() as unknown[];
      const actual = fn(...args);
      return {
        passed: deepEqual(actual, expected),
        input: testCase.input,
        expected: serialize(expected),
        actual: serialize(actual),
        note: testCase.note,
      };
    } catch (e) {
      return {
        passed: false,
        input: testCase.input,
        expected: serialize(expected),
        actual: '—',
        error: e instanceof Error ? e.message : String(e),
        note: testCase.note,
      };
    }
  });

  return {
    passed: outcomes.length > 0 && outcomes.every((o) => o.passed),
    cases: outcomes,
    durationMs: Date.now() - started,
  };
}
