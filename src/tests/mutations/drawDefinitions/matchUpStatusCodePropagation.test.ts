import { isProjectedExitCode } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

it('will properly clean up matchUpStatusCodes when removing DOUBLE_WALKOVERs', () => {
  const mockProfile = {
    // setting the participantsCount to one less than the drawSize will ensure a single BYE is produced
    drawProfiles: [{ drawSize: 4, participantsCount: 3 }],
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  // there should be only one matchUp ready for scoring
  let scoringMatchUp = tournamentEngine.tournamentMatchUps().upcomingMatchUps[0];
  expect(scoringMatchUp.roundNumber).toEqual(1);
  expect(scoringMatchUp.roundPosition).toEqual(2);

  const { matchUpId, drawId } = scoringMatchUp;

  // outcome copied from client payload
  let outcome: any = {
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
    },
    matchUpStatus: 'DOUBLE_WALKOVER',
    matchUpStatusCodes: ['WD.WD', 'WD.WD'],
    matchUpFormat: 'SET1-S:8/TB7@7',
  };

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  scoringMatchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find(({ matchUpId }) => matchUpId === scoringMatchUp.matchUpId);
  expect(scoringMatchUp.matchUpStatusCodes).toEqual(['WD.WD', 'WD.WD']);
  expect(scoringMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  let finalMatchUp = tournamentEngine.allTournamentMatchUps({
    contextFilters: { roundNames: ['Final'] },
  }).matchUps[0];
  expect(finalMatchUp.roundNumber).toEqual(2);
  expect(finalMatchUp.winningSide).toEqual(1);
  expect(finalMatchUp.matchUpStatus).toEqual(WALKOVER);
  // P37. The claim is that the scored matchUp's POLICY codes (`WD.WD`) did not ride downstream onto
  // the propagated final — so it is stated against the policy tenant, which is what survives the
  // exit tenant's eviction. It used to read `filter((code) => !code.sideNumber)`, i.e. "keep the
  // elements that are not the projection", which spelled the same claim in terms of the projection's
  // own shape and so broke the moment the projection stopped being written.
  expect((finalMatchUp.matchUpStatusCodes ?? []).filter((code: any) => !isProjectedExitCode(code))).toEqual([]);

  // outcome copied from client payload
  outcome = {
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
    },
    matchUpStatus: 'WALKOVER',
    matchUpStatusCodes: ['WD.ILL'],
    winningSide: 2,
    matchUpFormat: 'SET1-S:8/TB7@7',
  };

  result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  scoringMatchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find(({ matchUpId }) => matchUpId === scoringMatchUp.matchUpId);
  expect(scoringMatchUp.matchUpStatusCodes).toEqual(['WD.ILL']);
  expect(scoringMatchUp.matchUpStatus).toEqual(WALKOVER);

  // only one draw in this tournament so we expect only one final matchUp
  finalMatchUp = tournamentEngine.allTournamentMatchUps({
    contextFilters: { roundNames: ['Final'] },
  }).matchUps[0];

  expect(finalMatchUp.readyToScore).toEqual(true);
  expect(finalMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(finalMatchUp.matchUpStatusCodes).toBeUndefined();
});
