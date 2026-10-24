import { currentTestSeed } from './seedMathRandom';
import { afterAll, beforeAll, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * Opt-in: `SCHEDULING_VIEW_ROUND_TRIP=<file> pnpm vitest run` checks the planner's closed-view property
 * (`scheduling/viewRoundTrip.ts`) on the records every `scheduleProfileRounds` call in the run starts from, and appends,
 * per test file, one JSON line: the calls checked, and every call whose plan or view moved. Inert otherwise. A run that
 * checked nothing proves nothing, so the line carries its count whether or not anything fired.
 */
const out = process.env.SCHEDULING_VIEW_ROUND_TRIP;

if (out) {
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
      if (!result.samePlan || !result.viewUnchanged || result.readsRecords)
        failures.push({ test: currentTestSeed()?.name, ...result });
    } finally {
      checking = false;
    }
    return undefined;
  };

  const previous = getInvokeObserver();
  setInvokeObserver(observer);

  afterAll(() => {
    const file = relative(process.cwd(), expect.getState().testPath ?? 'unknown');
    appendFileSync(out, JSON.stringify({ file, checked, maxBytes, failures }) + '\n');
  });
}
