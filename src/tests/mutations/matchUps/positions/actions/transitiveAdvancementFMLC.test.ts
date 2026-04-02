import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import { getOrderedDrawPositionPairs, removeAssignment } from '../../../drawDefinitions/testingUtilities';

import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

it('can generate FMLC and properly place BYEs in consolation structure', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 6,
      drawSize: 8,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const mainStructureAssignments: any = structureAssignedDrawPositions({
    structure: mainStructure,
  });
  expect(mainStructureAssignments.byePositions.length).toEqual(2);
  const consolationStructureAssignments: any = structureAssignedDrawPositions({
    structure: consolationStructure,
  });
  expect(consolationStructureAssignments.byePositions.length).toEqual(2);
});

it('can advance participants when double BYEs are created removing 3-4', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 6,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  let {
    drawDefinition: {
      structures: [mainStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const odpp = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  });
  let { filteredOrderedPairs } = odpp;
  const { matchUps } = odpp;
  const structureMatchUps = matchUps.filter((matchUp) => matchUp.structureId === mainStructure.structureId);
  const finalMatchUp = structureMatchUps.find(
    ({ roundNumber, roundPosition }) => roundNumber === 2 && roundPosition === 1,
  );
  expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  removeAssignment({
    drawId,
    structureId: mainStructure.structureId,
    drawPosition: 3,
    replaceWithBye: true,
  });
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 4], // drawPositions 1 and 4 are both BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  let consolationStructure;
  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));
  /*
  let consolationStructureAssignments = structureAssignedDrawPositions({
    structure: consolationStructure,
  });
  */
  removeAssignment({
    drawId,
    structureId: mainStructure.structureId,
    drawPosition: 4,
    replaceWithBye: true,
  });

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 3],
    [8],
    [1], // drawPosition 4 is now a BYE, advancing 1
  ]);

  // now check the consolation structure
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  expect(filteredOrderedPairs).toEqual([
    [3, 4], // 3 and 4 are BYEs
    [5, 6], // 6 is a BYE
    [1, 3], // 1 is BYE-advanced, 3 is BYE
    [2, 5], // 5 is BYE-advanced
    [1], // 1 is BYE advanced by 3 which is a BYE
  ]);
  const consolationStructureAssignments: any = structureAssignedDrawPositions({
    structure: consolationStructure,
  });
  const byePositions = consolationStructureAssignments?.byePositions.map(({ drawPosition }) => drawPosition);
  expect(byePositions).toEqual([1, 3, 4, 6]);
});

it('can advance participants when double BYEs are created removing 5-6', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 6,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  let {
    drawDefinition: {
      structures: [mainStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const odpp = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  });
  let { filteredOrderedPairs } = odpp;
  const { matchUps } = odpp;
  const structureMatchUps = matchUps.filter((matchUp) => matchUp.structureId === mainStructure.structureId);
  const finalMatchUp = structureMatchUps.find(
    ({ roundNumber, roundPosition }) => roundNumber === 2 && roundPosition === 1,
  );
  expect(finalMatchUp.drawPositions).toEqual([1, undefined]);
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  removeAssignment({
    drawId,
    structureId: mainStructure.structureId,
    drawPosition: 5,
    replaceWithBye: true,
  });
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [6, 8], // drawPositions 6, 8 are BYE-advanced
  ]);

  let consolationStructure;
  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  removeAssignment({
    drawId,
    structureId: mainStructure.structureId,
    drawPosition: 6,
    replaceWithBye: true,
  });

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1],
    [5, 8],
    [8], // drawPosition 5 is now a BYE, advancing 8
  ]);

  // now check the consolation structure
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));
  expect(filteredOrderedPairs).toEqual([
    [3, 4], // 3 is a BYE; 4 is unassigned
    [5, 6], // 5, 6 are BYEs
    [1, 4], // 4 is BYE-advanced; 1 is unassigned
    [2, 6], // 2 is a BYE; 6 is BYE-advanced
    [2], // 2 is BYE advanced by 6 which is a BYE
  ]);
  const consolationStructureAssignments: any = structureAssignedDrawPositions({
    structure: consolationStructure,
  });
  const byePositions = consolationStructureAssignments?.byePositions.map(({ drawPosition }) => drawPosition);
  expect(byePositions).toEqual([2, 3, 5, 6]);
});

it('does not remove CONSOLATION BYE if at least one source position is a BYE', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 6,
      drawSize: 8,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const odpp = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  });
  let { filteredOrderedPairs } = odpp;
  const { matchUps } = odpp;
  const structureMatchUps = matchUps.filter((matchUp) => matchUp.structureId === mainStructure.structureId);
  const finalMatchUp = structureMatchUps.find(
    ({ roundNumber, roundPosition }) => roundNumber === 3 && roundPosition === 1,
  );
  if (finalMatchUp.drawPositions) {
    expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([]);
  }
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  // ACTION: remove draw position and replace with BYE
  removeAssignment({
    structureId: mainStructure.structureId,
    replaceWithBye: true,
    drawPosition: 3,
    drawId,
  });
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 4], // drawPositions 1 and 4 are both BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  // now check the consolation structure
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  expect(filteredOrderedPairs).toEqual([[3, 4], [5, 6], [1, 3], [2, 5], [1]]);

  // ACTION: remove draw position do NOT replace with BYE
  removeAssignment({
    structureId: mainStructure.structureId,
    drawPosition: 4,
    drawId,
  });

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [1], [8]]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  // removing { drawPosition: 4 } from mainStructure
  // consolation final still has drawPosition: 1 advanced by a propagated BYE from 1-2/3-4
  expect(filteredOrderedPairs).toEqual([[3, 4], [5, 6], [1, 3], [2, 5], [1]]);
});
