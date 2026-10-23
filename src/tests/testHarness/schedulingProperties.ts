import { currentTestSeed } from './seedMathRandom';
import { afterAll, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * Opt-in: `SCHEDULING_PROPERTIES=<file> pnpm vitest run` checks every scheduling call the suite makes against the
 * scheduling step properties (`scheduling/schedulingProperties.ts`) and appends, per test file, one JSON line: the calls
 * checked by method, and every violation with the test that produced it. Inert otherwise. A run that checked nothing
 * proves nothing, so the line carries its counts whether or not anything fired.
 */
const out = process.env.SCHEDULING_PROPERTIES;

/**
 * The calls that DECIDE placements; each is checked on the records before and after it. The bulk and reschedule
 * mutations write the dates and times their caller states, so what they place is the caller's decision, not a
 * scheduler's, and the properties do not apply to them.
 */
const PLACING_METHODS = new Set([
  'scheduleProfileRounds',
  'scheduleProfileGrid',
  'scheduleMatchUps',
  'proAutoSchedule',
]);

if (out) {
  const { checkSchedulingStep } = await import('./scheduling/schedulingProperties');
  const { checkSchedulingReport } = await import('./scheduling/schedulingReportProperties');
  const { schedulingReport } = await import('./scheduling/schedulingReport');
  const { getInvokeObserver, getTournamentRecords, setInvokeObserver } = await import('@Global/state/globalState');

  const checked: Record<string, number> = {};
  const violations: any[] = [];
  const open: { methodName: string; before: Record<string, any>; timing?: any; params?: any }[] = [];
  let checking = false;

  const snapshot = () => structuredClone(getTournamentRecords() ?? {});

  const observer = (event: any) => {
    previous?.(event);
    if (checking || !PLACING_METHODS.has(event.methodName)) return undefined;
    if (event.phase === 'before') {
      const { averageMatchUpMinutes, recoveryMinutes, recoveryMinutesMap } = event.params ?? {};
      const timing =
        event.methodName === 'scheduleMatchUps'
          ? { averageMatchUpMinutes, recoveryMinutes, recoveryMinutesMap }
          : undefined;
      open.push({ methodName: event.methodName, before: snapshot(), timing, params: event.params });
      return undefined;
    }
    const call = open.pop();
    if (!call || event.result?.error) return undefined;
    checking = true;
    try {
      const after = snapshot();
      checked[call.methodName] = (checked[call.methodName] ?? 0) + 1;
      for (const [tournamentId, record] of Object.entries(after)) {
        const before = call.before[tournamentId];
        if (!before) continue;
        const report = schedulingReport(call.methodName, event.result);
        for (const violation of [
          ...checkSchedulingStep({ before, after: record, timing: call.timing }),
          ...checkSchedulingReport({ before, after: record, report, params: call.params }),
        ])
          violations.push({ test: currentTestSeed()?.name, method: call.methodName, ...violation });
      }
    } finally {
      checking = false;
    }
  };

  const previous = getInvokeObserver();
  setInvokeObserver(observer);

  afterAll(() => {
    const file = relative(process.cwd(), expect.getState().testPath ?? 'unknown');
    appendFileSync(out, JSON.stringify({ file, checked, violations }) + '\n');
  });
}
