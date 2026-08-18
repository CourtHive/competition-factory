import { afterEach, describe, expect, it } from 'vitest';

import { setGlobalLog } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

/**
 * `dryRun`/`explain` dispatch through the same `executeFunction` path as a real
 * mutation, so under `devContext` a pre-flight and the commit that follows it
 * printed two identical lines — indistinguishable, and read by callers as the
 * mutation having fired twice. The pre-flight lines now carry `dryRun: true`,
 * and `dryRun` emits one summary line so its own overhead (deep copy, patch
 * walk, restore) is visible rather than hidden inside the caller's click.
 */

const SET_TOURNAMENT_DATES = 'setTournamentDates';

type Captured = { log: any; engine?: string };

function captureLogs(): { captured: Captured[] } {
  const captured: Captured[] = [];
  setGlobalLog(({ log, engine }: Captured) => captured.push({ log, engine }));
  return { captured };
}

afterEach(() => {
  setGlobalLog();
  tournamentEngine.devContext(false);
  tournamentEngine.reset();
});

describe('dryRun dev logging', () => {
  it('tags pre-flight method lines with dryRun and leaves the real call untagged', () => {
    mocksEngine.generateTournamentRecord({
      nonRandom: 1,
      setState: true,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    });

    tournamentEngine.devContext({ params: true, result: true });
    const { captured } = captureLogs();

    tournamentEngine.explain(SET_TOURNAMENT_DATES, { startDate: '2026-08-02', endDate: '2026-08-06' });

    const preflight = captured.filter((c) => c.log?.method === SET_TOURNAMENT_DATES);
    expect(preflight).toHaveLength(1);
    expect(preflight[0].log.dryRun).toEqual(true);

    captured.length = 0;
    tournamentEngine.setTournamentDates({ startDate: '2026-08-02', endDate: '2026-08-06' });

    const committed = captured.filter((c) => c.log?.method === SET_TOURNAMENT_DATES);
    expect(committed).toHaveLength(1);
    // The real mutation must NOT be tagged — otherwise the tag distinguishes
    // nothing, which is the bug this guards.
    expect(committed[0].log.dryRun).toBeUndefined();
  });

  it('emits a cost summary carrying the overhead dryRun adds on top of execution', () => {
    mocksEngine.generateTournamentRecord({
      nonRandom: 1,
      setState: true,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    });

    tournamentEngine.devContext({ params: true, result: true });
    const { captured } = captureLogs();

    tournamentEngine.explain(SET_TOURNAMENT_DATES, { startDate: '2026-08-02', endDate: '2026-08-06' });

    const summary = captured.find((c) => c.log?.dryRun === true && c.log?.method === undefined);
    expect(summary).toBeDefined();
    expect(summary?.log.methods).toEqual(1);
    expect(summary?.log.overhead).toEqual(
      expect.objectContaining({
        snapshot: expect.any(Number),
        restore: expect.any(Number),
        diff: expect.any(Number),
      }),
    );
    expect(typeof summary?.log.elapsed).toEqual('number');
    // A date change that shifts start + end must show up as patch operations —
    // a zero here would mean the summary is reporting on a run that did nothing.
    expect(summary?.log.patchOps).toBeGreaterThan(0);
  });

  it('logs nothing at all when devContext is off', () => {
    mocksEngine.generateTournamentRecord({
      nonRandom: 1,
      setState: true,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    });

    tournamentEngine.devContext(false);
    const { captured } = captureLogs();

    tournamentEngine.explain(SET_TOURNAMENT_DATES, { startDate: '2026-08-02', endDate: '2026-08-06' });

    expect(captured).toEqual([]);
  });
});
