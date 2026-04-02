import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { completeMatchUp, verifyMatchUps } from '../../primitives/verifyMatchUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { generateFMLC } from '../../primitives/firstMatchLoserConsolation';
import { getDrawStructures } from '@Acquire/findStructure';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/matchUpTypes';
import { MALE } from '@Constants/genderConstants';
import { MAIN, CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

tournamentEngine.devContext(true);

it('can direct winners and losers', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 32;

  let result;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    drawSize,
    seedsCount,
    participantsCount,
  });

  verifyMatchUps({
    expectedRoundUpcoming: [16, 0],
    expectedRoundCompleted: [0, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 2,
    winningSide: 2,
    roundNumber: 1,
    drawDefinition,
  });
  const { matchUps } = getAllDrawMatchUps({ drawDefinition, inContext: true });
  const matchUp = matchUps?.find(
    (matchUp) => matchUp.structureId === mainStructureId && matchUp.roundNumber === 1 && matchUp.roundPosition === 2,
  );
  const { matchUpId } = matchUp ?? {};
  expect(result.success).toEqual(true);

  verifyMatchUps({
    expectedRoundCompleted: [1, 0],
    expectedRoundUpcoming: [15, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });

  verifyMatchUps({
    structureId: consolationStructureId,
    expectedRoundPending: [8, 8, 4, 2, 1],
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  matchUpId &&
    setMatchUpState({
      matchUpStatus: TO_BE_PLAYED,
      winningSide: undefined,
      score: { sets: [] },
      drawDefinition,
      matchUpId,
    });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [16, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: verifyConsolationStructureId } = consolationStructure;

  expect(consolationStructure.positionAssignments?.[1].participantId).toBeUndefined();

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);
});

it('can direct winners and losers', () => {
  const participantsCount = 30;
  const seedsCount = 8;
  const drawSize = 32;

  let result;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    drawSize,
    seedsCount,
    participantsCount,
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [14, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 2,
    winningSide: 2,
    roundNumber: 1,
    drawDefinition,
  });
  const { matchUps } = getAllDrawMatchUps({ drawDefinition, inContext: true });
  const matchUp = matchUps?.find(
    (matchUp) => matchUp.structureId === mainStructureId && matchUp.roundNumber === 1 && matchUp.roundPosition === 2,
  );
  const { matchUpId } = matchUp ?? {};
  expect(result.success).toEqual(true);

  verifyMatchUps({
    expectedRoundCompleted: [1, 0],
    expectedRoundUpcoming: [13, 1],
    expectedRoundPending: [0, 7],
    structureId: mainStructureId,
    drawDefinition,
  });

  let {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  expect(consolationStructure.positionAssignments?.[1].participantId).toBeUndefined();

  verifyMatchUps({
    expectedRoundPending: [6, 8, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  matchUpId &&
    setMatchUpState({
      drawDefinition,
      matchUpId,
      ...toBePlayed,
    });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [14, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  ({
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  }));
  const { structureId: verifyConsolationStructureId } = consolationStructure;
  expect(consolationStructure.positionAssignments?.[1].participantId).toBeUndefined();

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);
});

it('can remove matchUps properly in FIRST_MATCH_LOSER_CONSOLATION', () => {
  const participantsProfile = {
    participantsCount: 100,
    sex: MALE,
  };
  const drawProfiles = [
    {
      drawSize: 16,
      eventType: SINGLES,
      participantsCount: 14,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const drawId = drawIds[0];

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });

  const { matchUps: mainDrawMatchUps } = mainStructure;
  const { matchUpId } = mainDrawMatchUps?.[1] ?? {};

  let {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: consolationStructureId } = consolationStructure;

  expect(consolationStructure.positionAssignments?.[1].participantId).toBeUndefined();

  const result = tournamentEngine.setMatchUpStatus({
    outcome: toBePlayed,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp.score).toEqual({});

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));

  consolationStructure = drawDefinition.structures.find(
    (structure) => structure.structureId === consolationStructureId,
  );

  expect(consolationStructure.positionAssignments?.[1].participantId).toBeUndefined();
});
