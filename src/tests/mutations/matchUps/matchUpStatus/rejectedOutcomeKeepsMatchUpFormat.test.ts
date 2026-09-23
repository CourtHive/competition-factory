import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_MATCHUP_STATUS, UNRECOGNIZED_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';

/**
 * A REFUSED `setMatchUpStatus` must not leave the `matchUpFormat` it was given.
 *
 * `setMatchUpStatus` accepts a `matchUpFormat` alongside an outcome. It used to apply that format
 * through `applyMatchUpFormat` — a WRITE — before the outcome had been validated at all, so a call
 * that was then refused still changed the matchUp's scoring format. Measured on `dev` 2026-09-23:
 * an outcome rejected with `ERR_INVALID_MATCHUP_STATUS` moved the format from `SET3-S:6/TB7` to
 * `SET5-S:4/TB7` and kept it.
 *
 * This is the general `ERROR_IMPLIES_NO_MUTATION` property, which the exit-propagation harness
 * asserts over the cascade. It could never have caught THIS: `observeMutation` calls
 * `setMatchUpStatus` with only `{ propagateExitStatus, matchUpId, drawId, outcome }`, so
 * `matchUpFormat` is never in the sampled surface.
 *
 * Each half of the rule is asserted separately, because they fail independently: dropping the
 * write without keeping the validation would silently accept a bad format, and keeping the write
 * where it was would leave the defect.
 */

const START_FORMAT = 'SET3-S:6/TB7';
const NEW_FORMAT = 'SET5-S:4/TB7';

function scenario() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
  const matchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);

  const formatOf = () =>
    tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUp.matchUpId)
      ?.matchUpFormat;

  return { drawId, matchUpId: matchUp.matchUpId, formatOf };
}

it('leaves matchUpFormat untouched when the outcome is refused', () => {
  const { drawId, matchUpId, formatOf } = scenario();
  expect(formatOf()).toEqual(START_FORMAT);

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: 'NOT_A_REAL_STATUS' },
    matchUpFormat: NEW_FORMAT,
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
  expect(formatOf()).toEqual(START_FORMAT);
});

it('still applies matchUpFormat when the outcome is accepted', () => {
  const { drawId, matchUpId, formatOf } = scenario();

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 1, winningSide: 1, setNumber: 1 }] } },
    matchUpFormat: 'SET1-S:6/TB7',
    matchUpId,
    drawId,
  });

  expect(result.error).toBeUndefined();
  expect(formatOf()).toEqual('SET1-S:6/TB7');
});

it('refuses an unrecognised matchUpFormat before touching the draw', () => {
  const { drawId, matchUpId, formatOf } = scenario();

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 1, winningSide: 1, setNumber: 1 }] } },
    matchUpFormat: 'NOT-A-FORMAT',
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
  expect(formatOf()).toEqual(START_FORMAT);

  // the refusal is the format's, so the outcome it accompanied must not have landed either
  const matchUp: any = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUpId);
  expect(matchUp.winningSide).toBeUndefined();
});
