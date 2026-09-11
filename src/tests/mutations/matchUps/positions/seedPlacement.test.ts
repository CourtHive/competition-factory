import { initializeStructureSeedAssignments } from '@Mutate/drawDefinitions/positionGovernor/initializeSeedAssignments';
import { modifySeedAssignment } from '@Mutate/drawDefinitions/entryGovernor/modifySeedAssignment';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { numericSort } from '@Tools/sorting';
import { mocksEngine } from '../../../..';
import { expect, it } from 'vitest';
import { getNextSeedBlock, getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { findStructure, getDrawStructures } from '@Acquire/findStructure';

import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { policyComposer } from '@Global/policyComposer';
import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { EntryStatusUnion } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { ERROR } from '@Constants/resultConstants';
import { INVALID_VALUES, MISSING_STRUCTURE_ID, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';

// `POLICY_SEEDING_NATIONAL` used to supply this. It was ITF seeding with one key omitted, and the
// composer says so in a way a fixture never could: leaving `validSeedPositions` unset is what keeps
// manual seed placement inside a valid seed block.
const SEEDING_POSITIONS_ENFORCED = policyComposer(POLICY_TYPE_SEEDING)
  .extend(POLICY_SEEDING_ITF)
  .unset('validSeedPositions')
  .set('policyName', 'ITF SEEDING, POSITIONS ENFORCED')
  .build();

it('can define seedAssignments', () => {
  const drawSize = 8;
  let seedsCount = 16;
  const stage = MAIN;

  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      enforcePolicyLimits: false,
      automated: false,
      seedsCount,
      drawSize,
    },
  });

  const { structures: stageStructures } = getDrawStructures({
    stageSequence: 1,
    drawDefinition,
    stage,
  });
  const { structureId } = stageStructures[0];

  // generates error if seedsCount is greater than drawSize
  let result = initializeStructureSeedAssignments({
    drawDefinition,
    structureId,
    seedsCount,
  });
  expect(result).toHaveProperty(ERROR);

  seedsCount = 4;
  result = initializeStructureSeedAssignments({
    drawDefinition,
    structureId,
    seedsCount,
  });
  expect(result.success).toEqual(true);

  const { seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structureId,
  });
  expect(seedAssignments?.length).toEqual(seedsCount);
});

it('generates valild seedBlocks given different policies', () => {
  const ITF32expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [32] },
    { seedNumbers: [3, 4], drawPositions: [9, 24] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [8, 16, 17, 25] },
    {
      seedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
      drawPositions: [4, 5, 12, 13, 20, 21, 28, 29],
    },
  ];
  checkSeedBlocks({
    drawSize: 32,
    policy: SEEDING_ITF,
    expectedBlocks: ITF32expectedBlocks,
  });

  const ITF64expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [64] },
    { seedNumbers: [3, 4], drawPositions: [17, 48] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [16, 32, 33, 49] },
    {
      seedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
      drawPositions: [8, 9, 24, 25, 40, 41, 56, 57],
    },
  ];
  checkSeedBlocks({
    drawSize: 64,
    policy: SEEDING_ITF,
    expectedBlocks: ITF64expectedBlocks,
  });

  const USTA16expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [16] },
    { seedNumbers: [3, 4], drawPositions: [5, 12] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [3, 7, 10, 14] },
  ];
  checkSeedBlocks({
    drawSize: 16,
    policy: SEEDING_USTA,
    expectedBlocks: USTA16expectedBlocks,
  });

  const USTA32expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [32] },
    { seedNumbers: [3, 4], drawPositions: [9, 24] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [5, 13, 20, 28] },
    {
      seedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
      drawPositions: [3, 7, 11, 15, 18, 22, 26, 30],
    },
  ];
  checkSeedBlocks({
    drawSize: 32,
    policy: SEEDING_USTA,
    expectedBlocks: USTA32expectedBlocks,
  });

  const USTA64expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [64] },
    { seedNumbers: [3, 4], drawPositions: [17, 48] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [9, 25, 40, 56] },
    {
      seedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
      drawPositions: [5, 13, 21, 29, 36, 44, 52, 60],
    },
  ];
  checkSeedBlocks({
    drawSize: 64,
    policy: SEEDING_USTA,
    expectedBlocks: USTA64expectedBlocks,
  });

  const USTA128expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [128] },
    { seedNumbers: [3, 4], drawPositions: [33, 96] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [17, 49, 80, 112] },
    {
      seedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
      drawPositions: [9, 25, 41, 57, 72, 88, 104, 120],
    },
    {
      seedNumbers: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
      drawPositions: [5, 13, 21, 29, 37, 45, 53, 61, 68, 76, 84, 92, 100, 108, 116, 124],
    },
  ];
  checkSeedBlocks({
    drawSize: 128,
    policy: SEEDING_USTA,
    expectedBlocks: USTA128expectedBlocks,
  });

  const USTA256expectedBlocks = [
    { seedNumbers: [1], drawPositions: [1] },
    { seedNumbers: [2], drawPositions: [256] },
    { seedNumbers: [3, 4], drawPositions: [65, 192] },
    { seedNumbers: [5, 6, 7, 8], drawPositions: [33, 97, 160, 224] },
    {
      seedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
      drawPositions: [17, 49, 81, 113, 144, 176, 208, 240],
    },
    {
      seedNumbers: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
      drawPositions: [9, 25, 41, 57, 73, 89, 105, 121, 136, 152, 168, 184, 200, 216, 232, 248],
    },
    {
      seedNumbers: [
        33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
        61, 62, 63, 64,
      ],
      drawPositions: [
        5, 13, 21, 29, 37, 45, 53, 61, 69, 77, 85, 93, 101, 109, 117, 125, 132, 140, 148, 156, 164, 172, 180, 188, 196,
        204, 212, 220, 228, 236, 244, 252,
      ],
    },
  ];
  checkSeedBlocks({
    expectedBlocks: USTA256expectedBlocks,
    policy: SEEDING_USTA,
    drawSize: 256,
  });
});

it('can assign seedNumbers and drawPositions to seeded participants', () => {
  const seedsCount = 16;
  const drawSize = 64;
  const stage = MAIN;

  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      policyDefinitions: SEEDING_POSITIONS_ENFORCED,
      enforcePolicyLimits: false,
      automated: false,
      seedsCount,
      drawSize,
    },
  });

  const { structures: stageStructures } = getDrawStructures({
    stageSequence: 1,
    drawDefinition,
    stage,
  });
  const { structureId } = stageStructures[0];
  let result = initializeStructureSeedAssignments({
    drawDefinition,
    structureId,
    seedsCount,
  });
  expect(result.success).toEqual(true);

  const entryStatuses: EntryStatusUnion[] = [DIRECT_ACCEPTANCE, WILDCARD];
  const participants = getStageEntries({
    drawDefinition,
    entryStatuses,
    stage,
  });
  const participantId = participants[0].participantId;
  const participantId2 = participants[1].participantId;
  const participantId3 = participants[2].participantId;

  let { unplacedSeedNumbers, unfilledPositions } = getNextSeedBlock({
    drawDefinition,
    structureId,
  });
  const seedNumber = unplacedSeedNumbers.pop();
  let drawPosition = unfilledPositions.pop();
  expect(drawPosition).toEqual(1);
  expect(seedNumber).toEqual(1);

  // attempt to assign a valid seedNumber to a participantId
  result = assignSeed({
    drawDefinition,
    structureId,
    seedNumber,
    participantId,
  });
  expect(result.success).toEqual(true);

  // attempt to assign an invalid position to a seeded participant
  result = assignDrawPosition({
    drawPosition: 2,
    drawDefinition,
    participantId,
    structureId,
  });
  expect(result).toHaveProperty(ERROR);

  // attempt to assign a valid position to a seeded participant
  result = assignDrawPosition({
    drawDefinition,
    participantId,
    drawPosition,
    structureId,
  });
  expect(result.success).toEqual(true);

  // assign an unseeded participant to a drawPosition which is not a seed position
  result = assignDrawPosition({
    participantId: participantId2,
    drawPosition: 2,
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  // attempt to assign a seedNumber to a participant already in a non-seed drawPosition
  result = assignSeed({
    participantId: participantId2,
    seedNumber: 2,
    drawDefinition,
    structureId,
  });
  expect(result).toHaveProperty(ERROR);

  // assign an unseeded participant to a drawPosition which *is* a seed position
  result = assignDrawPosition({
    participantId: participantId2,
    drawPosition: 64,
    drawDefinition,
    structureId,
  });
  // expect ERROR as this participantId is already assigned to another position
  expect(result).toHaveProperty(ERROR);

  // clear draw position by specifying the participantId to derive the drawPosition
  result = clearDrawPosition({
    participantId: participantId2,
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  // nominate participant as 2nd seed
  result = assignSeed({
    participantId: participantId2,
    drawDefinition,
    seedNumber: 2,
    structureId,
  });
  expect(result.success).toEqual(true);

  result = assignDrawPosition({
    participantId: participantId2,
    drawPosition: 64,
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  ({ unplacedSeedNumbers, unfilledPositions } = getNextSeedBlock({
    drawDefinition,
    structureId,
  }));
  expect(unplacedSeedNumbers).toMatchObject([3, 4]);
  expect(unfilledPositions).toMatchObject([17, 48]);

  // nominate participant as 4th seed
  result = assignSeed({
    participantId: participantId3,
    seedNumber: 4,
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  // modify the seedValue for an existing seed assignment
  // @ts-expect-error missing structureId
  result = modifySeedAssignment({
    participantId: participantId3,
    drawDefinition,
  });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = modifySeedAssignment({
    participantId: participantId3,
    structureId: 'bogusId',
    drawDefinition,
  });
  expect(result.error).toEqual(STRUCTURE_NOT_FOUND);

  result = modifySeedAssignment({
    participantId: participantId3,
    seedValue: 'xxx',
    drawDefinition,
    structureId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = modifySeedAssignment({
    participantId: participantId3,
    seedValue: '5-8',
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  let { seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structureId,
  });
  expect(seedAssignments?.[3].seedValue).toEqual('5-8');

  result = modifySeedAssignment({
    participantId: participantId3,
    seedValue: '0',
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  result = modifySeedAssignment({
    participantId: participantId3,
    seedValue: undefined,
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  result = modifySeedAssignment({
    participantId: participantId3,
    drawDefinition,
    seedValue: '',
    structureId,
  });
  expect(result.success).toEqual(true);

  drawPosition = unfilledPositions.pop();
  expect(drawPosition).toEqual(48);
  result = assignDrawPosition({
    participantId: participantId3,
    drawDefinition,
    drawPosition,
    structureId,
  });
  expect(result.success).toEqual(true);

  ({ unplacedSeedNumbers, unfilledPositions } = getNextSeedBlock({
    drawDefinition,
    structureId,
  }));
  expect(unplacedSeedNumbers).toMatchObject([3]);
  expect(unfilledPositions).toMatchObject([17]);

  ({ seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structureId,
  }));
  expect(seedAssignments?.length).toEqual(16);
  const assignedSeedPositions = seedAssignments?.filter((assignment) => assignment.participantId);
  expect(assignedSeedPositions?.length).toEqual(3);

  // validation can be disabled
  result = modifySeedAssignment({
    participantId: 'additional participant',
    validation: false,
    seedValue: 'yyy',
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  // will add a seedNumber and new seedAssignment if participantId is not recognized
  // drawEngine does not have access to participants and cannot verify validity of participantId
  result = modifySeedAssignment({
    participantId: 'additional participant',
    seedValue: '99',
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  ({ seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structureId,
  }));

  expect(seedAssignments?.length).toEqual(17);
  expect(seedAssignments?.[16].seedValue).toEqual(99);
});

function checkSeedBlocks({ drawSize, policy, expectedBlocks }) {
  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: { automated: false, drawSize },
  });
  const structureId = drawDefinition.structures[0].structureId;

  const seedsCount = Math.max(...[].concat(...expectedBlocks.map((b) => b.seedNumbers)));

  const result = attachPolicies({
    policyDefinitions: policy,
    allowReplacement: true,
    drawDefinition,
  });
  expect(result.success).toEqual(true);
  initializeStructureSeedAssignments({
    drawDefinition,
    structureId,
    seedsCount,
  });

  const { structure } = findStructure({ drawDefinition, structureId });

  const { appliedPolicies } = getAppliedPolicies({ drawDefinition });
  const validSeedBlocks =
    structure &&
    getValidSeedBlocks({
      appliedPolicies,
      drawDefinition,
      structure,
    }).validSeedBlocks;

  expect(validSeedBlocks).toBeDefined();

  if (validSeedBlocks) {
    validSeedBlocks.forEach((seedBlock, i) => {
      expect([...seedBlock.seedNumbers].sort(numericSort)).toMatchObject(
        expectedBlocks[i].seedNumbers.sort(numericSort),
      );
      expect([...seedBlock.drawPositions].sort(numericSort)).toMatchObject(
        [...expectedBlocks[i].drawPositions].sort(numericSort),
      );
    });
  }
}
