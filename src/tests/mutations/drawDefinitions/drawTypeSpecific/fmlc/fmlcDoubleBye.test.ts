import { getOrderedDrawPositionPairs, replaceWithBye } from '@Tests/mutations/drawDefinitions/testingUtilities';
import { generateFMLC } from '@Tests/mutations/drawDefinitions/primitives/firstMatchLoserConsolation';
import { verifyStructure } from '@Tests/mutations/drawDefinitions/primitives/verifyStructure';
import { verifyMatchUps } from '@Tests/mutations/drawDefinitions/primitives/verifyMatchUps';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';
import { SINGLES } from '@Constants/eventConstants';

tournamentEngine.devContext(true);

const policyDefinitions = { [POLICY_TYPE_FEED_IN]: { feedFromMainFinal: true } };

it('can generate FIRST_MATCH_LOSER_CONSOLATION with double-byes in consolation 17/32', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 17;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    policyDefinitions,
    participantsCount,
    seedsCount,
    drawSize,
  });

  verifyStructure({
    expectedSeedValuesWithBye: [1, 2, 3, 4, 5, 6, 7, 8],
    expectedPositionsAssignedCount: 32,
    structureId: mainStructureId,
    expectedByeAssignments: 15,
    expectedSeedsWithByes: 8,
    expectedSeeds: 8,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [1, 7],
    expectedRoundPending: [0, 1],
    structureId: mainStructureId,
    drawDefinition,
  });

  verifyStructure({
    structureId: consolationStructureId,
    expectedPositionsAssignedCount: 15,
    expectedSeedValuesWithBye: [],
    expectedByeAssignments: 15,
    expectedSeedsWithByes: 0,
    expectedSeeds: 0,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [0, 0, 1, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 1],
    requireParticipants: false,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [0, 1, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });
});

it('can generate FIRST_MATCH_LOSER_CONSOLATION with double-byes in consolation 18/32', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 18;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    participantsCount,
    policyDefinitions,
    seedsCount,
    drawSize,
  });

  verifyStructure({
    expectedSeedValuesWithBye: [1, 2, 3, 4, 5, 6, 7, 8],
    expectedPositionsAssignedCount: 32,
    structureId: mainStructureId,
    expectedByeAssignments: 14,
    expectedSeedsWithByes: 8,
    expectedSeeds: 8,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [2, 6],
    expectedRoundPending: [0, 2],
    structureId: mainStructureId,
    drawDefinition,
  });

  verifyStructure({
    structureId: consolationStructureId,
    expectedPositionsAssignedCount: 14,
    expectedSeedValuesWithBye: [],
    expectedByeAssignments: 14,
    expectedSeedsWithByes: 0,
    expectedSeeds: 0,
    drawDefinition,
  });

  verifyMatchUps({
    structureId: consolationStructureId,
    expectedRoundPending: [0, 0, 2, 2, 1],
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 2],
    requireParticipants: false,
    drawDefinition,
  });

  verifyMatchUps({
    structureId: consolationStructureId,
    expectedRoundPending: [0, 2, 4, 2, 1],
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });
});

it('can remove 2nd round MAIN draw result when no participant went to consolation from 2nd round', () => {
  const participantsProfile = {
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
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
        {
          roundNumber: 1,
          roundPosition: 5,
          scoreString: '6-1 6-5',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 6,
          scoreString: '6-1 7-6(3)',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 7,
          scoreString: '6-1 7-5',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 3,
          scoreString: '6-2 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 4,
          scoreString: '6-2 6-4',
          winningSide: 1,
        },
        // now add consolation results
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
          winningSide: 1,
          stage: CONSOLATION,
          stageSequence: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
          stage: CONSOLATION,
          stageSequence: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
          stage: CONSOLATION,
          stageSequence: 1,
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

  // there should be 13 completed matchUps
  let { completedMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
  });
  expect(completedMatchUps.length).toEqual(13);

  // target specific matchUp
  let targetMatchUp = completedMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 2 && roundPosition === 2 && stage === MAIN && stageSequence === 1,
  );
  const { matchUpId, score, winningSide } = targetMatchUp;
  expect(score.scoreStringSide1).toEqual('6-2 6-2');

  // remove outcome
  let result = tournamentEngine.setMatchUpStatus({
    outcome: toBePlayed,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // outcome removal should be succesful => now expecting 12 completed matchUps
  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  targetMatchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(targetMatchUp.score).toEqual({});
  ({ completedMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
  }));
  expect(completedMatchUps.length).toEqual(12);

  // complete matchUp
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome: {
      score,
      winningSide,
    },
  });
  expect(result.success).toEqual(true);
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(targetMatchUp.score).not.toBeUndefined();

  ({ completedMatchUps } = tournamentEngine.drawMatchUps({ drawId }));
  expect(completedMatchUps.length).toEqual(13);
});

it('can propagate BYE to 2nd round feed arm when 1st round Double-BYE creates 2nd round Bye paired with completed matchUp', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      eventType: SINGLES,
      drawSize: 4,
    },
  ];

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const { upcomingMatchUps } = tournamentEngine.drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[1].matchUpId;

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const {
    drawDefinition: {
      structures: [{ structureId: mainStructureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  let { orderedPairs, positionAssignments } = getConsolationDetails({
    drawId,
  });
  expect(orderedPairs).toEqual([[2, 3], [1]]);
  expect(positionAssignments.map(({ participantId }) => !!participantId)).toEqual([false, false, true]);

  replaceWithBye({ drawId, structureId: mainStructureId, drawPosition: 1 });
  ({ positionAssignments } = getConsolationDetails({ drawId }));
  expect(positionAssignments.map(({ bye }) => !!bye)).toEqual([false, true, false]);

  replaceWithBye({ drawId, structureId: mainStructureId, drawPosition: 2 });
  ({ positionAssignments } = getConsolationDetails({ drawId }));
  expect(positionAssignments.map(({ bye }) => !!bye)).toEqual([true, true, false]);
});

it('can propagate BYE to 2nd round feed arm when 1st round Double-BYE creates 2nd round Bye paired with incomplete matchUp', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      eventType: SINGLES,
      drawSize: 4,
    },
  ];

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [{ structureId: mainStructureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  let { orderedPairs } = getConsolationDetails({ drawId });
  expect(orderedPairs).toEqual([[2, 3], [1]]);

  replaceWithBye({ drawId, structureId: mainStructureId, drawPosition: 1 });
  let { positionAssignments } = getConsolationDetails({ drawId });
  expect(positionAssignments.map(({ bye }) => !!bye)).toEqual([false, true, false]);

  replaceWithBye({ drawId, structureId: mainStructureId, drawPosition: 2 });

  const { upcomingMatchUps } = tournamentEngine.drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  const result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);

  ({ positionAssignments } = getConsolationDetails({ drawId }));
  expect(positionAssignments.map(({ bye }) => !!bye)).toEqual([true, true, false]);
});

function getConsolationDetails({ drawId }) {
  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const positionAssignments = structures[1].positionAssignments;
  const { orderedPairs, matchUps } = getOrderedDrawPositionPairs({
    structureId: structures[1].structureId,
  });
  return { matchUps, orderedPairs, positionAssignments };
}
