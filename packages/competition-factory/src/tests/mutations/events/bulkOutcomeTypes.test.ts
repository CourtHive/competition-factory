import { tournamentEngine } from '../../../index';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, expectTypeOf, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * The public types of the two bulk writers. A caller's outcome literal carries the outcome itself (`matchUpStatus`,
 * `winningSide`, `score`) beside its identifiers, and must type-check as it always has. `pnpm check-types` checks this file: a
 * narrowed parameter type fails here with TS2353 before any test runs. The engine is the package's own typed export.
 */
it('a bulk outcome literal with its status, winner and score type-checks and is applied', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  const [matchUp] = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } }).matchUps ?? [];
  const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
    outcomes: [
      {
        tournamentId: tournamentRecord.tournamentId,
        matchUpId: matchUp?.matchUpId ?? '',
        matchUpStatus: COMPLETED,
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
        eventId,
        drawId,
      },
    ],
    rollbackOnError: false,
  });
  expect(result.success).toEqual(true);
});

it('an ad hoc reset declares its per-matchUp results and its committed flag', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'h', drawSize: 4, drawType: 'AD_HOC', automated: true, roundsCount: 1 }],
    completeAllMatchUps: true,
    setState: true,
  });
  const matchUpIds = (tournamentEngine.allDrawMatchUps({ drawId: 'h' }).matchUps ?? []).map((m: any) => m.matchUpId);
  const result = tournamentEngine.resetAdHocMatchUps({ drawId: 'h', matchUpIds });
  expectTypeOf(result).toHaveProperty('results');
  expectTypeOf(result).toHaveProperty('committed');
  expect(result.results?.map((entry) => entry.matchUpId)).toEqual(matchUpIds);
  expect(tournamentEngine.findMatchUp({ matchUpId: matchUpIds[0] }).matchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
});
