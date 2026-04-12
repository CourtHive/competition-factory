import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { initializeStructureSeedAssignments } from '@Mutate/drawDefinitions/positionGovernor/initializeSeedAssignments';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { addDrawEntries } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { getDrawStructures } from '@Acquire/findStructure';
import { verifyStructure } from '../primitives/verifyStructure';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

import SEEDING_POLICY from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { MAIN, CONSOLATION, CURTIS, PLAY_OFF } from '@Constants/drawDefinitionConstants';

it('can generate and verify curtis structures', () => {
  let mainStructureId, consolation1stStructureId, consolation2ndStructureId, drawDefinition;

  ({ consolation1stStructureId, consolation2ndStructureId, mainStructureId, drawDefinition } = generateCurtis({
    participantsCount: 30,
    assignSeeds: 8,
    seedsCount: 8,
    drawSize: 32,
  }));

  const { seedAssignments } = getStructureSeedAssignments({
    structureId: mainStructureId,
    drawDefinition,
  });
  expect(seedAssignments?.length).toEqual(8);

  verifyStructure({
    expectedRoundMatchUpsCounts: [16, 8, 4, 2, 1],
    expectedPositionsAssignedCount: 32,
    expectedSeedValuesWithBye: [1, 2],
    structureId: mainStructureId,
    expectedByeAssignments: 2,
    expectedSeedsWithByes: 2,
    expectedSeeds: 8,
    drawDefinition,
  });

  verifyStructure({
    drawDefinition,
    structureId: consolation1stStructureId,
    expectedSeeds: 0,
    expectedSeedsWithByes: 0,
    expectedByeAssignments: 2,
    expectedSeedValuesWithBye: [],
    expectedPositionsAssignedCount: 2,
    expectedRoundMatchUpsCounts: [8, 8, 4, 2, 1],
  });

  verifyStructure({
    drawDefinition,
    structureId: consolation2ndStructureId,
    expectedSeeds: 0,
    expectedSeedsWithByes: 0,
    expectedByeAssignments: 0,
    expectedSeedValuesWithBye: [],
    expectedPositionsAssignedCount: 0,
    expectedRoundMatchUpsCounts: [2, 2, 1],
  });

  ({ drawDefinition, mainStructureId } = generateCurtis({
    participantsCount: 60,
    assignSeeds: 14,
    seedsCount: 16,
    drawSize: 64,
  }));

  verifyStructure({
    drawDefinition,
    structureId: mainStructureId,
    expectedSeeds: 14,
    expectedSeedsWithByes: 4,
    expectedByeAssignments: 4,
    expectedSeedValuesWithBye: [1, 2, 3, 4],
    expectedPositionsAssignedCount: 64,
    expectedRoundMatchUpsCounts: [32, 16, 8, 4, 2, 1],
  });

  const result = generateCurtis({
    participantsCount: 60,
    assignSeeds: 14,
    seedsCount: 16,
    drawSize: 64,
  });

  ({ drawDefinition, consolation1stStructureId, consolation2ndStructureId } = result);

  verifyStructure({
    structureId: result.playoffStructureId,
    expectedPositionsAssignedCount: 0,
    expectedRoundMatchUpsCounts: [1],
    expectedSeedValuesWithBye: [],
    expectedByeAssignments: 0,
    expectedSeedsWithByes: 0,
    expectedSeeds: 0,
    drawDefinition,
  });

  verifyStructure({
    drawDefinition,
    structureId: consolation1stStructureId,
    expectedSeeds: 0,
    expectedSeedsWithByes: 0,
    expectedByeAssignments: 4,
    expectedSeedValuesWithBye: [],
    expectedPositionsAssignedCount: 4,
    expectedRoundMatchUpsCounts: [16, 16, 8, 4, 2, 1],
  });

  verifyStructure({
    drawDefinition,
    structureId: consolation2ndStructureId,
    expectedSeeds: 0,
    expectedSeedsWithByes: 0,
    expectedByeAssignments: 0,
    expectedSeedValuesWithBye: [],
    expectedPositionsAssignedCount: 0,
    expectedRoundMatchUpsCounts: [4, 4, 2, 1],
  });
});

function generateCurtis({ seedAssignmentProfile = {}, participantsCount, assignSeeds, seedsCount, drawSize }) {
  const stage = MAIN;
  const drawType = CURTIS;

  const drawDefinition = newDrawDefinition();
  generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType, drawSize });

  const { stageStructures } = getDrawStructures({
    withStageGrouping: true,
    drawDefinition,
  });
  expect(Object.keys(stageStructures).length).toEqual(drawSize === 64 ? 3 : 2);

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage, stageSequence: 1 });
  const { structureId: mainStructureId } = mainStructure;

  const {
    structures: [playoffStructure],
  } = getDrawStructures({ drawDefinition, stage: PLAY_OFF, stageSequence: 2 });
  const playoffStructureId = playoffStructure?.structureId;

  const {
    structures: [consolation1stStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: consolation1stStructureId } = consolation1stStructure;

  const {
    structures: [consolation2ndStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 2,
  });
  const { structureId: consolation2ndStructureId } = consolation2ndStructure;

  attachPolicies({ drawDefinition, policyDefinitions: SEEDING_POLICY });

  const participants = generateRange(0, participantsCount).map((i) => ({
    participantId: `ko-uuid${i + 1}`,
  }));
  const participantIds = participants.map((p) => p.participantId);

  addDrawEntries({ drawDefinition, stage, participantIds });
  initializeStructureSeedAssignments({
    structureId: mainStructureId,
    drawDefinition,
    seedsCount,
  });

  assignSeeds = assignSeeds || seedsCount;
  if (assignSeeds > participantsCount) assignSeeds = participantsCount;
  generateRange(1, assignSeeds + 1).forEach((seedNumber) => {
    const participantId = participants[seedNumber - 1].participantId;
    const seedValue = seedAssignmentProfile[seedNumber] || seedNumber;
    assignSeed({
      structureId: mainStructureId,
      drawDefinition,
      participantId,
      seedNumber,
      seedValue,
    });
  });

  automatedPositioning({ drawDefinition, structureId: mainStructureId });

  return {
    consolation1stStructureId,
    consolation2ndStructureId,
    playoffStructureId,
    mainStructureId,
    drawDefinition,
  };
}
