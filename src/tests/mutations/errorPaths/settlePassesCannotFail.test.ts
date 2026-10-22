import { reconcileScoredTimes } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * TWO SETTLE PASSES CANNOT FAIL, BY CONSTRUCTION — outcome v2 executor plan, Phase C prerequisite 2.
 *
 * A settle pass runs after the cascade has written. An error found there could not be refused without leaving those
 * writes behind, and an error changes nothing with no caller rollback to lean on (CA, 2026-10-18 and 2026-10-22). So a
 * pass may not have a failure to report: its inner call must be unable to fail.
 *
 * - `reconcileLinkAdvancements`: `releaseLinkedWinnerAdvancement` declares no `error`, and the pass assigns its result
 *   to `ReleaseCannotFail`, so a release that one day declares one does not compile. That guard is the type checker's;
 *   nothing here repeats it.
 * - `reconcileScoredTimes`: `modifyMatchUpNotice` fails only on a missing matchUp, and the pass's guard reads
 *   `matchUp?.schedule?.scoredTime` before the notice. This file pins that guard: the matchUps it is handed can hold a
 *   hole, and the notice is still never made without a matchUp, so it never returns its error.
 *
 * Measured 2026-10-22 (factory `dev` `01ce40e544`), over the full suite and the frozen census windows w1, w2 and de:
 * the release was reached 4 times and the notice 3,922 times, never with an error.
 */

const notices = vi.hoisted(() => ({ results: [] as any[] }));

vi.mock('@Mutate/notifications/drawNotifications', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    modifyMatchUpNotice: (params: any) => {
      const result = actual.modifyMatchUpNotice(params);
      if (params?.context === 'reconcileScoredTimes') notices.results.push(result);
      return result;
    },
  };
});

afterEach(() => {
  notices.results = [];
});

it('reconcileScoredTimes never makes its notice without a matchUp', () => {
  const drawId = 'stale-scored-time';
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId, drawSize: 8 }], nonRandom: 7002, setState: true });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const matchUps = drawDefinition.structures[0].matchUps;
  const stale = matchUps.find((matchUp: any) => matchUp.roundNumber === 2);
  expect(stale.matchUpStatus).toEqual(TO_BE_PLAYED);
  stale.schedule = { ...stale.schedule, scoredTime: '2026-10-22T12:00:00Z' };

  // a hole in the matchUps it is handed, as an untyped caller could leave one
  reconcileScoredTimes({ matchUps: [undefined as any, ...matchUps], drawDefinition, tournamentRecord });

  // CONTROL: the pass reached its notice, for the stale stamp, and cleared it
  expect(stale.schedule.scoredTime).toBeUndefined();
  expect(notices.results.length).toEqual(1);
  // and no notice it made returned an error
  expect(notices.results.filter((result) => result?.error)).toEqual([]);
});
