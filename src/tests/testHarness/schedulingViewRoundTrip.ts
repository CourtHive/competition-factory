import { appendFileSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import { currentTestSeed } from './seedMathRandom';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';

/**
 * Opt-in: `SCHEDULING_VIEW_ROUND_TRIP=<file> pnpm vitest run` checks the planner's closed-view property
 * (`scheduling/viewRoundTrip.ts`) on the records every `scheduleProfileRounds` call in the run starts from, and appends,
 * per test file, one JSON line: the calls checked, and every call whose plan or view moved. Inert otherwise. A run that
 * checked nothing proves nothing, so the line carries its count whether or not anything fired.
 */
const out = process.env.SCHEDULING_VIEW_ROUND_TRIP;
/**
 * `SCHEDULING_PLAN_CASES=<file>` also writes every call checked as a `kernel.scheduling.plan@1` case, one JSON line each
 * (`pnpm kernel:harvest-scheduling`): RECORDED cases, which pin this implementation's plans for a second one to meet.
 * They are generated, never committed; the authored cases in `kernel/cases/scheduling.json` are the committed ones.
 */
const casesOut = process.env.SCHEDULING_PLAN_CASES;

if (out || casesOut) {
  // the pipeline is imported once the test file has loaded, never here: a module a setup file imports is cached before
  // the test's `vi.mock` runs, so a test that mocks part of the pipeline would see its mock bypassed
  let checkViewRoundTrip: (typeof import('./scheduling/viewRoundTrip'))['checkViewRoundTrip'] | undefined;
  beforeAll(async () => {
    ({ checkViewRoundTrip } = await import('./scheduling/viewRoundTrip'));
  });
  const { getInvokeObserver, getTournamentRecords, setInvokeObserver } = await import('@Global/state/globalState');

  let checked = 0;
  let maxBytes = 0;
  const failures: any[] = [];
  let checking = false;

  const observer = (event: any) => {
    previous?.(event);
    // the deprecated `pro` path is another scheduler, with no view
    if (!checkViewRoundTrip || checking) return undefined;
    if (event.methodName !== 'scheduleProfileRounds' || event.phase !== 'before' || event.params?.pro) return undefined;
    checking = true;
    try {
      const tournamentRecords = structuredClone(getTournamentRecords() ?? {});
      const result = checkViewRoundTrip({ tournamentRecords, params: event.params ?? {} });
      if (!result.planned) return undefined;
      checked += 1;
      maxBytes = Math.max(maxBytes, result.bytes);
      const { harvest, ...check } = result;
      if (!check.samePlan || !check.viewUnchanged || check.readsRecords)
        failures.push({ test: currentTestSeed()?.name, ...check });
      if (casesOut && !mocksThePipeline()) appendFileSync(casesOut, JSON.stringify(recordedCase(harvest)) + '\n');
    } finally {
      checking = false;
    }
    return undefined;
  };

  const previous = getInvokeObserver();
  setInvokeObserver(observer);

  afterAll(() => {
    const file = relative(process.cwd(), expect.getState().testPath ?? 'unknown');
    if (out) appendFileSync(out, JSON.stringify({ file, checked, maxBytes, failures }) + '\n');
  });
}

/** a harvested call as a case: its id is a hash of its input, so the same call recorded twice is one case */
function recordedCase({ view, options, plan }: { view: unknown; options: unknown; plan: unknown }) {
  const input = { view, options };
  const hash = createHash('sha256').update(canonicalJson(input)).digest('hex').slice(0, 16);
  return {
    caseId: `scheduling.recorded.${hash}.v1`,
    operation: 'kernel.scheduling.plan@1',
    expected: { kind: 'value', value: plan },
    input,
  };
}

/**
 * A test file that mocks part of the scheduling pipeline (the played-order guard's test turns the gate off) plans with
 * the mock: its round trip is still a fair check, since both plans use the mock, but its plans are not this
 * implementation's, so none is recorded as a case.
 */
let mockingFile: { path?: string; mocks: boolean } = { mocks: false };
function mocksThePipeline() {
  const path = expect.getState().testPath;
  if (mockingFile.path !== path) {
    const source = path ? readFileSync(path, 'utf8') : '';
    mockingFile = { path, mocks: /vi\.mock\(\s*['"]@Mutate\/matchUps\/schedule/.test(source) };
  }
  return mockingFile.mocks;
}
