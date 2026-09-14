import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import {
  getOrderedDrawPositionPairs,
  replaceWithBye,
  replaceWithAlternate,
  removeAssignment,
} from '../../../drawDefinitions/testingUtilities';

// constants
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

it('can remove transitive BYEs in consolation of FIC', () => {
  // STEP #1: generate FIC w/ 8 participants
  const drawProfiles = [
    {
      drawType: FEED_IN_CHAMPIONSHIP,
      participantsCount: 8,
      alternatesCount: 10,
      drawSize: 8,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  let {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

  const mainMatchUps = mainStructure.matchUps;
  const finalMatchUp = mainMatchUps.find(({ roundNumber, roundPosition }) => roundNumber === 3 && roundPosition === 1);
  expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([]);

  let { filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  });
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([[4, 5], [6, 7], [2], [3], [1]]);

  let assignedParticipantIds = mainStructure.positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedParticipantIds.length).toEqual(8);

  let assignedByes = mainStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(0);

  assignedByes = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(0);

  // STEP #2: replace all positions with BYEs
  replaceWithByes({
    drawPositions: [1, 8, 3, 2, 4, 7, 6, 5],
    structureId: mainStructure.structureId,
    drawId,
  });

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));

  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 3],
    [6, 8],
    [3, 6],
  ]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));

  expect(filteredOrderedPairs).toEqual([
    [4, 5],
    [6, 7],
    [2, 4],
    [3, 7],
    [2, 7],
    [1, 7],
  ]);

  // STEP #3: check main structure has 0 participants and 8 BYEs
  assignedParticipantIds = mainStructure.positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedParticipantIds.length).toEqual(0);
  assignedByes = mainStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(8);

  // STEP #4: check consolation structure has 7 BYEs
  assignedByes = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(7);

  // STEP #5: place two alternates
  replaceWithAlternates({
    structureId: mainStructure.structureId,
    drawPositions: [3, 7],
    drawId,
  });

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));

  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 3],
    [6, 7],
    [3, 7],
  ]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));

  // consolation structure positions have not changed
  expect(filteredOrderedPairs).toEqual([
    [4, 5],
    [6, 7],
    [2, 4],
    [3, 7],
    [2, 7],
    [1, 7],
  ]);

  // STEP #6: check main structure has 2 participants and 6 BYEs
  assignedParticipantIds = mainStructure.positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedParticipantIds.length).toEqual(2);
  assignedByes = mainStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(6);
  assignedByes = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(6);

  removeAssignment({
    structureId: mainStructure.structureId,
    drawPosition: 4,
    drawId,
  });

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [1], [6, 7], [7]]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  expect(filteredOrderedPairs).toEqual([[4, 5], [6, 7], [2], [3, 7], [7], [1]]);
});

function replaceWithByes({ drawPositions, drawId, structureId }) {
  drawPositions.forEach((drawPosition) => {
    replaceWithBye({ drawId, structureId, drawPosition });
  });
}
function replaceWithAlternates({ drawPositions, drawId, structureId }) {
  drawPositions.forEach((drawPosition) => {
    replaceWithAlternate({ drawId, structureId, drawPosition });
  });
}
