import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { SCORE } from '@Constants/matchUpActionConstants';

it('can create double bye and remove advanced participant when outcome is reset', () => {
  const participantsProfile = {
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      participantsCount: 7,
      drawSize: 8,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
      ],
    },
  ];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { completedMatchUps, upcomingMatchUps, byeMatchUps, pendingMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
  });
  expect(byeMatchUps.length).toEqual(1);
  expect(completedMatchUps.length).toEqual(3);
  expect(pendingMatchUps.length).toEqual(1);
  expect(upcomingMatchUps.length).toEqual(2);

  let matchUp = byeMatchUps[0];
  const { structureId } = matchUp;
  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  let finalMatchUp = matchUps.find(({ roundNumber }) => roundNumber === 3);
  expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([]);

  // now replace the participant in { drawPosition; 1 } with a BYE
  replaceWithBye({
    drawId,
    structureId,
    drawPosition: 1,
    expectations: { bye: 2, complete: 3, pending: 1, upcoming: 1 },
  });

  ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));
  finalMatchUp = matchUps.find(({ roundNumber }) => roundNumber === 3);
  expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([3]);

  // now remove the result for matchUp: { roundNumber: 1, roundPosition: 2 }
  matchUp = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 2);
  const { validActions } = tournamentEngine.matchUpActions(matchUp);
  const scoreAction = validActions.find(({ type }) => type === SCORE);
  const { method, payload } = scoreAction;

  Object.assign(payload, { outcome: toBePlayed });
  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  checkExpectations({
    drawId,
    expectations: { bye: 2, complete: 2, pending: 1, upcoming: 2 },
  });
  ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));

  finalMatchUp = matchUps.find(({ roundNumber }) => roundNumber === 3);
  expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([]);
});

it('can create double bye and replace bye with alternate', () => {
  const participantsProfile = {
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 7,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
      ],
    },
  ];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles, participantsProfile });
  tournamentEngine.setState(tournamentRecord);

  const { completedMatchUps, upcomingMatchUps, byeMatchUps, pendingMatchUps } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  });
  expect(byeMatchUps.length).toEqual(1);
  expect(completedMatchUps.length).toEqual(3);
  expect(pendingMatchUps.length).toEqual(1);
  expect(upcomingMatchUps.length).toEqual(2);

  let matchUp = byeMatchUps[0];
  const { structureId } = matchUp;

  // now replace the participant in { drawPosition; 1 } with a BYE
  replaceWithBye({
    expectations: { bye: 2, complete: 3, pending: 1, upcoming: 1 },
    drawPosition: 1,
    structureId,
    drawId,
  });

  // now again replace the BYE with an alternate
  replaceWithAlternate({
    expectations: { bye: 1, complete: 3, pending: 1, upcoming: 2 },
    drawPosition: 1,
    structureId,
    drawId,
  });

  // now replace the participant in { drawPosition; 1 } with a BYE
  replaceWithBye({
    expectations: { bye: 2, complete: 3, pending: 1, upcoming: 1 },
    drawPosition: 1,
    structureId,
    drawId,
  });

  // now again replace the BYE with an alternate
  replaceWithAlternate({
    expectations: { bye: 1, complete: 3, pending: 1, upcoming: 2 },
    drawPosition: 2,
    structureId,
    drawId,
  });

  // now replace the participant in { drawPosition; 2 } with a BYE
  replaceWithBye({
    expectations: { bye: 2, complete: 3, pending: 1, upcoming: 1 },
    drawPosition: 2,
    structureId,
    drawId,
  });

  // now remove the result for matchUp: { roundNumber: 1, roundPosition: 2 }
  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  matchUp = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 2);
  let { validActions } = tournamentEngine.matchUpActions(matchUp);
  let scoreAction = validActions.find(({ type }) => type === SCORE);
  let { method, payload } = scoreAction;

  Object.assign(payload, { outcome: toBePlayed });
  let result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  checkExpectations({
    drawId,
    expectations: { bye: 2, complete: 2, pending: 1, upcoming: 2 },
  });

  // now set winningSide again
  const { outcome } = generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    winningSide: 2,
  });
  ({ validActions } = tournamentEngine.matchUpActions(matchUp));
  scoreAction = validActions.find(({ type }) => type === SCORE);
  ({ method, payload } = scoreAction);

  Object.assign(payload, { outcome, winningSide: outcome.winningSide });
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  checkExpectations({
    drawId,
    expectations: { bye: 2, complete: 3, pending: 1, upcoming: 1 },
  });
  ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));
  const finalMatchUp = matchUps.find((matchUp) => matchUp.roundNumber === 3 && matchUp.roundPosition === 1);
  expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([4]);
  ({ validActions } = tournamentEngine.matchUpActions(matchUp));
  scoreAction = validActions.find(({ type }) => type === SCORE);
  ({ method, payload } = scoreAction);

  Object.assign(payload, { outcome: toBePlayed });
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  checkExpectations({
    drawId,
    expectations: { bye: 2, complete: 2, pending: 1, upcoming: 2 },
  });

  // now replace the participant in { drawPosition; 3 } with a BYE
  replaceWithBye({
    expectations: { bye: 3, complete: 2, pending: 1, upcoming: 1 },
    drawPosition: 3,
    structureId,
    drawId,
  });

  // now replace the participant in { drawPosition; 4 } with a BYE
  replaceWithBye({
    expectations: { bye: 4, complete: 2, pending: 0, upcoming: 1 },
    drawPosition: 4,
    structureId,
    drawId,
  });
});

function replaceWithBye({ drawId, structureId, drawPosition, expectations }) {
  const { validActions } = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });
  const { method, payload } = validActions.find(({ type }) => type === BYE);
  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  checkExpectations({ drawId, expectations });
}

function replaceWithAlternate({ drawId, structureId, drawPosition, expectations }) {
  let result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  const altAction = result.validActions.find(({ type }) => type === ALTERNATE);
  const { method, payload, availableAlternatesParticipantIds } = altAction;
  const alternateParticipantId = availableAlternatesParticipantIds[0];
  Object.assign(payload, { alternateParticipantId });
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  checkExpectations({ drawId, expectations });
}

function checkExpectations({ drawId, expectations }) {
  const { completedMatchUps, upcomingMatchUps, byeMatchUps, pendingMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
  });
  const expectedMatchUpsCount =
    completedMatchUps.length + upcomingMatchUps.length + byeMatchUps.length + pendingMatchUps.length;
  const expectationValues: number[] = Object.values(expectations);
  const expectationsTotal = expectationValues.reduce((a, b) => a + b, 0);
  if (expectationsTotal !== expectedMatchUpsCount) {
    console.log({ expectedMatchUpsCount, expectationsTotal });
  }
  expect(byeMatchUps.length).toEqual(expectations.bye);
  expect(completedMatchUps.length).toEqual(expectations.complete);
  expect(pendingMatchUps.length).toEqual(expectations.pending);
  expect(upcomingMatchUps.length).toEqual(expectations.upcoming);
  byeMatchUps.forEach(({ matchUpStatus }) => expect(matchUpStatus).toEqual(BYE));
  completedMatchUps.forEach(({ matchUpStatus }) => expect(matchUpStatus).toEqual(COMPLETED));
  pendingMatchUps.forEach(({ matchUpStatus }) => expect(matchUpStatus).toEqual(TO_BE_PLAYED));
  upcomingMatchUps.forEach(({ matchUpStatus }) => expect(matchUpStatus).toEqual(TO_BE_PLAYED));
}
