import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { chunkArray, unique } from '@Tools/arrays';
import { it, expect } from 'vitest';

// constants and fixtures
import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

const scenarios = [
  { drawProfiles: [{ drawSize: 32, drawType: ROUND_ROBIN, seedsCount: 8 }] },
  {
    drawProfiles: [
      {
        enforcePolicyLimits: false,
        drawType: ROUND_ROBIN,
        seedsCount: 16,
        drawSize: 32,
      },
    ],
  },
  {
    drawProfiles: [
      {
        enforcePolicyLimits: false,
        drawType: ROUND_ROBIN,
        seedsCount: 24,
        drawSize: 32,
      },
    ],
  },
  {
    drawProfiles: [
      {
        enforcePolicyLimits: false,
        drawType: ROUND_ROBIN,
        seedsCount: 32,
        drawSize: 32,
      },
    ],
  },
];

it.each(scenarios)('can seed drawType: ROUND_ROBIN', (scenario) => {
  let result = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SEEDING_DEFAULT,
    ...scenario,
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const structureId = structure.structureId;

  const participantDetails = {};

  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });

  const positionsAssigned = positionAssignments.filter((assignment) => {
    const { participantId, drawPosition } = assignment;
    participantDetails[participantId] = { drawPosition };
    return participantId;
  });
  expect(positionAssignments.length).toEqual(positionsAssigned.length);

  const { seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structure,
  });

  const assignedSeeds = seedAssignments?.filter((assignment) => {
    const { participantId, seedNumber, seedValue } = assignment;
    if (participantId) {
      participantDetails[participantId].seedNumber = seedNumber;
      participantDetails[participantId].seedValue = seedValue;
    }
    return participantId;
  });
  expect(seedAssignments?.length).toEqual(assignedSeeds?.length);

  const groups = chunkArray(Object.values(participantDetails), 4);
  const seedsPerGroup = unique(groups.map((group) => group.filter(({ seedNumber }) => seedNumber).length));
  expect(seedsPerGroup.length).toEqual(1);
});
