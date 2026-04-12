import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { initializeStructureSeedAssignments } from '@Mutate/drawDefinitions/positionGovernor/initializeSeedAssignments';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { addDrawEntries } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { getStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { drawMatchUps } from '@Query/matchUps/getDrawMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { MAIN, PLAY_OFF, COMPASS } from '@Constants/drawDefinitionConstants';
import SEEDING_POLICY from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { BYE } from '@Constants/matchUpStatusConstants';

it('can generate COMPASS and fill all drawPositions', () => {
  let drawSize, seedsCount, participantsCount;
  let expectedCompassByes, expectedByeDrawPositions, expectedByeRemoval;

  drawSize = 32;
  seedsCount = 8;
  participantsCount = 30; // we will have 2 BYEs
  expectedCompassByes = {
    East: { byeDrawPositions: [2, 31], roundPositions: [1, 16] },
    West: { byeDrawPositions: [1, 16], roundPositions: [1, 8] },
    South: { byeDrawPositions: [1, 8], roundPositions: [1, 4] },
    Southeast: { byeDrawPositions: [1, 4], roundPositions: [1, 2] },
  };
  expectedByeDrawPositions = {
    East: { advancedFiltered: [2, 1, 8], unadvancedFiltered: 0 },
    West: { advancedFiltered: [2, 1, 4], unadvancedFiltered: 0 },
    South: { advancedFiltered: [2, 1, 2], unadvancedFiltered: 0 },
    Southeast: {
      pendingAdvancedDrawPositions: [2, 3],
      pendingAdvancedRoundPosition: 1,
      pendingAdvancedLength: 1,
      advancedFiltered: [0],
      unadvancedPending: 1,
    },
  };
  expectedByeRemoval = {
    initialByeMatchUpCount: 8,
    clearExpect: [],
  };

  generateCompass({
    drawSize,
    seedsCount,
    participantsCount,
    expectedByeRemoval,
    expectedCompassByes,
    expectedByeDrawPositions,
  });

  drawSize = 32;
  seedsCount = 8;
  participantsCount = 28; // we will have 4 BYEs
  expectedCompassByes = {
    East: { byeDrawPositions: [2, 10, 23, 31], roundPositions: [1, 5, 12, 16] },
    West: { byeDrawPositions: [1, 5, 12, 16], roundPositions: [1, 3, 6, 8] },
    South: { byeDrawPositions: [1, 3, 6, 8], roundPositions: [1, 2, 3, 4] },
    Southeast: { byeDrawPositions: [1, 2, 3, 4], roundPositions: [1, 2, 1] },
  };
  expectedByeDrawPositions = {
    East: { advancedFiltered: [4, 1, 3], unadvancedFiltered: 0 },
    West: { advancedFiltered: [4, 1, 2], unadvancedFiltered: 0 },
    South: { advancedFiltered: [0], unadvancedFiltered: 0 },
    Southeast: {
      pendingAdvancedRoundPosition: undefined,
      pendingAdvancedDrawPositions: undefined,
      pendingAdvancedLength: 0,
      unadvancedFiltered: 0,
      advancedFiltered: [0],
      unadvancedPending: 0,
    },
  };
  expectedByeRemoval = {
    initialByeMatchUpCount: 15,
    clearExpect: [],
  };

  generateCompass({
    drawSize,
    seedsCount,
    participantsCount,
    expectedByeRemoval,
    expectedCompassByes,
    expectedByeDrawPositions,
  });
});

function testByeRemoval({ drawDefinition, stages, expectedByeRemoval }) {
  const { structures } = getDrawStructures({ drawDefinition, stages });

  const directionEast = findStructureByName(structures, 'East');
  const { structureId } = directionEast;
  const byeDrawPositions = assignedByes(directionEast.positionAssignments);

  const { byeMatchUps } = drawMatchUps({ drawDefinition });
  expect(byeMatchUps?.length).toEqual(expectedByeRemoval.initialByeMatchUpCount);

  if (expectedByeRemoval.clearExpect) {
    expectedByeRemoval.clearExpect.forEach(([index, length]) => {
      clearDrawPosition({
        drawPosition: byeDrawPositions[index],
        drawDefinition,
        structureId,
      });
      const { byeMatchUps } = drawMatchUps({ drawDefinition });
      expect(byeMatchUps?.length).toEqual(length);
    });
  }
}

function checkCompassByes({ drawDefinition, stages, expectedCompassByes }) {
  const { structures } = getDrawStructures({ drawDefinition, stages });

  Object.keys(expectedCompassByes).forEach((direction) => {
    const structure = findStructureByName(structures, direction);
    const byeDrawPositions = assignedByes(structure.positionAssignments);
    expect(byeDrawPositions).toMatchObject(expectedCompassByes[direction].byeDrawPositions);
    const byeMatchUpRoundPositions = matchUpsWithBye(structure.matchUps);
    expect(byeMatchUpRoundPositions).toMatchObject(expectedCompassByes[direction].roundPositions);
  });
}

function pendingWithOneParticipant(matchUp) {
  return matchUp.roundNumber === 2 && matchUp.drawPositions.filter(Boolean).length === 1;
}
function checkAdvancedExpectations(expected, filteredMatchUps, pendingMatchUps) {
  const expectedFiltered = expected.advancedFiltered;
  if (expectedFiltered) {
    expect(filteredMatchUps?.length).toEqual(expectedFiltered[0]);
    if (filteredMatchUps?.length) {
      if (expectedFiltered[1]) expect(filteredMatchUps[0].roundPosition).toEqual(expectedFiltered[1]);
      if (expectedFiltered[2]) expect(filteredMatchUps[1].roundPosition).toEqual(expectedFiltered[2]);
    }
  }
  const pendingLength = expected.pendingAdvancedLength;
  if (pendingLength) expect(pendingMatchUps?.length).toEqual(pendingLength);
  if (pendingMatchUps?.length) {
    const pendingRoundPosition = expected.pendingAdvancedRoundPosition;
    if (pendingRoundPosition) expect(pendingMatchUps[0].roundPosition).toEqual(pendingRoundPosition);
    const pendingDrawPositions = expected.pendingAdvancedDrawPositions;
    if (pendingDrawPositions) {
      expect(pendingMatchUps[0].drawPositions).toMatchObject(pendingDrawPositions);
    }
  }
}

function checkByeAdvancedDrawPositions({ expectedByeDrawPositions, drawDefinition, advanced, stages }) {
  const { structures } = getDrawStructures({ drawDefinition, stages });

  Object.keys(expectedByeDrawPositions).forEach((direction) => {
    const structure = findStructureByName(structures, direction);
    const { pendingMatchUps } = getStructureMatchUps({
      drawDefinition,
      structure,
    });
    const filteredMatchUps = pendingMatchUps?.filter(pendingWithOneParticipant);

    if (advanced) {
      checkAdvancedExpectations(expectedByeDrawPositions[direction], filteredMatchUps, pendingMatchUps);
    } else {
      const unadvancedFiltered = expectedByeDrawPositions[direction].unadvancedFiltered;
      if (unadvancedFiltered) expect(filteredMatchUps?.length).toEqual(unadvancedFiltered);
      const unadvancedPending = expectedByeDrawPositions[direction].unadvancedPending;
      if (unadvancedPending) expect(pendingMatchUps?.length).toEqual(unadvancedPending);
      const pendingDrawPositions = expectedByeDrawPositions[direction].pendingUnadvancedDrawPositions;
      if (pendingDrawPositions) {
        console.log(pendingMatchUps?.[0].drawPositions);
        expect(pendingMatchUps?.[0].drawPositions).toMatchObject(pendingDrawPositions[0]);
        console.log(pendingMatchUps?.[1].drawPositions);
        expect(pendingMatchUps?.[1].drawPositions).toMatchObject(pendingDrawPositions[1]);
        console.log(pendingMatchUps?.[2].drawPositions);
        expect(pendingMatchUps?.[2].drawPositions).toMatchObject(pendingDrawPositions[2]);
      }
    }
  });
}

function generateCompass({
  expectedByeDrawPositions,
  expectedCompassByes,
  expectedByeRemoval,
  participantsCount,
  seedsCount,
  drawSize,
}) {
  const stage = MAIN;
  const stages = [MAIN, PLAY_OFF];
  const drawType = COMPASS;

  const drawDefinition = newDrawDefinition();
  generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType, drawSize });
  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage, stageSequence: 1 });
  const { structureId } = structure;

  attachPolicies({ drawDefinition, policyDefinitions: SEEDING_POLICY });

  const participants = generateRange(0, participantsCount).map((i) => ({
    participantId: `ko-uuid${i + 1}`,
  }));
  const participantIds = participants.map((p) => p.participantId);

  addDrawEntries({ drawDefinition, stage, participantIds });
  initializeStructureSeedAssignments({
    drawDefinition,
    structureId,
    seedsCount,
  });

  generateRange(0, seedsCount).forEach((i) => {
    const seedNumber = i + 1;
    const participantId = participants[i].participantId;
    assignSeed({ drawDefinition, structureId, seedNumber, participantId });
  });

  automatedPositioning({ drawDefinition, structureId });

  // Verify East (root) is MAIN and all secondaries are PLAY_OFF
  expect(structure.stage).toEqual(MAIN);
  const { structures: allStructures } = getDrawStructures({ drawDefinition, stages });
  const secondaries = allStructures.filter((s) => s.structureName !== 'East');
  secondaries.forEach((s) => {
    expect(s.stage).toEqual(PLAY_OFF);
    expect(s.stageSequence).toBeGreaterThan(1);
  });

  checkCompassByes({ drawDefinition, stages, expectedCompassByes });
  checkByeAdvancedDrawPositions({
    expectedByeDrawPositions,
    advanced: true,
    drawDefinition,
    stages,
  });

  testByeRemoval({ drawDefinition, stages, expectedByeRemoval });
  checkByeAdvancedDrawPositions({
    expectedByeDrawPositions,
    advanced: false,
    drawDefinition,
    stages,
  });
}

function assignedByes(assignments) {
  return assignments.filter((assignment) => assignment.bye).map((assignment) => assignment.drawPosition);
}
function matchUpsWithBye(matchUps) {
  return matchUps.filter((matchUp) => matchUp.matchUpStatus === BYE).map((matchUp) => matchUp.roundPosition);
}
function findStructureByName(structures, structureName) {
  return structures.reduce((structure, currentStructure) => {
    return currentStructure.structureName === structureName ? currentStructure : structure;
  }, undefined);
}
