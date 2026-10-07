import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { UNRECOGNIZED_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';

it('reports a round whose timing cannot be found as an error, not as a scheduled round', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawId: 'did' }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const { tournamentId, eventId, drawId, structureId } = matchUps[0];
  const valid = { tournamentId, eventId, drawId, structureId, roundNumber: 1, sortOrder: 1 };
  const invalid = { tournamentId, eventId, drawId, structureId, roundNumber: 2, sortOrder: 2 };
  // every round 2 matchUp carries a format no timing can be found for
  const withUnrecognizedFormat = matchUps.map((matchUp) =>
    matchUp.roundNumber === 2 ? { ...matchUp, matchUpFormat: 'UNRECOGNIZED' } : matchUp,
  );

  let result: any = tournamentEngine.getScheduledRoundsDetails({
    matchUps: withUnrecognizedFormat,
    rounds: [valid, invalid],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledRoundsDetails.length).toEqual(2);
  expect(result.scheduledRoundsDetails[0].matchUpIds.length).toEqual(4);
  expect(result.scheduledRoundsDetails.some((details) => details?.error)).toEqual(false);
  expect(result.scheduledRoundsDetails[1]).toBeUndefined();
  expect(result.roundErrors).toEqual([{ error: UNRECOGNIZED_MATCHUP_FORMAT, round: invalid }]);

  // rounds that all resolve report no round errors
  result = tournamentEngine.getScheduledRoundsDetails({ matchUps, rounds: [valid, invalid] });
  expect(result.scheduledRoundsDetails.every((details) => details?.matchUpIds)).toEqual(true);
  expect(result.roundErrors).toBeUndefined();
});
