import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import type { Offense } from './queryPurity/checker';
import { relative } from 'node:path';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Query purity over the whole suite (Mentat/planning/FACTORY_LAYERING_PLAN.md, step Q): every engine call to a query
 * or generator (queryPurity/methodKinds.json) is checked for a write to engine state (queryPurity/checker.ts). A test
 * whose calls wrote fails, naming the method and the write, unless queryPurity/knownWriters.ts allows that write.
 *
 * On by default, in every run. `QUERY_PURITY=report` records instead of failing, the known writes included: one JSON
 * line per test file appended to `QUERY_PURITY_OUT` (default `.query-purity/tally.jsonl`, ignored by git).
 * `QUERY_PURITY=0` turns it off.
 *
 * Nothing here imports engine code before a test file does: a setup file that loaded the engine would run before the
 * file's `vi.mock` registered, and the mocks would not apply.
 */
const mode = process.env.QUERY_PURITY ?? 'enforce';

const describeOffense = ({ methodName, write, path: at }: Offense) =>
  [`${methodName}: ${write}`, at && `at ${at}`].filter(Boolean).join(' ');

if (mode !== '0') {
  const { QueryPurityCheck } = await import('./queryPurity/checker');
  const { isKnownWrite } = await import('./queryPurity/knownWriters');
  const check = new QueryPurityCheck();
  check.install(); // also checks engine calls made before the first test (beforeAll, module level)
  const tally: Record<string, { calls: number; known: number; writes: Record<string, string[]> }> = {};
  let testFile = '';

  const record = (offenses: Offense[]) => {
    const testName = expect.getState().currentTestName ?? '';
    for (const { methodName, write, path: written, options } of offenses) {
      const entry = (tally[methodName] ??= { calls: 0, known: 0, writes: {} });
      entry.calls += 1;
      if (isKnownWrite(methodName, options)) entry.known += 1;
      const examples = (entry.writes[write] ??= []);
      const set = Object.keys(options).map((key) => `${key}:${options[key]}`);
      const example = `${testName} @ ${written ?? ''} [${set.join(',')}]`;
      if (examples.length < 3 && !examples.includes(example)) examples.push(example);
    }
  };

  beforeEach(() => {
    testFile = relative(process.cwd(), expect.getState().testPath ?? '');
    check.install();
  });

  afterEach(() => {
    const offenses = check.take();
    if (mode === 'report') return record(offenses);
    const unknown = offenses.filter(({ methodName, options }) => !isKnownWrite(methodName, options));
    if (!unknown.length) return;
    const lines = [...new Set(unknown.map(describeOffense))];
    throw new Error(`a query wrote engine state (testHarness/queryPurity.ts):\n  ${lines.join('\n  ')}`);
  });

  afterAll(() => {
    if (mode !== 'report') return;
    const outFile = process.env.QUERY_PURITY_OUT ?? '.query-purity/tally.jsonl';
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const line = { file: testFile, checkedCalls: check.checkedCalls, inheritedStamps: check.inheritedStamps };
    fs.appendFileSync(outFile, JSON.stringify({ ...line, offenders: tally }) + '\n');
  });
}
