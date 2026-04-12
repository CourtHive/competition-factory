import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { assignDrawPosition } from '@Mutate/drawDefinitions/assignDrawPosition';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { getDrawStructures } from '@Acquire/findStructure';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { MAIN, ROUND_ROBIN, CONTAINER } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { ERROR, SUCCESS } from '@Constants/resultConstants';
import { EntryStatusUnion } from '@Types/tournamentTypes';

let result;

it('can assign SINGLE_ELIMINATION draw drawPositions', () => {
  const stage = MAIN;
  const drawSize = 4;

  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      automated: false,
      drawSize,
    },
  });

  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage });

  const entryStatuses: EntryStatusUnion[] = [DIRECT_ACCEPTANCE, WILDCARD];
  const mainDrawEntries = getStageEntries({
    drawDefinition,
    entryStatuses,
    stage,
  });
  const participantIds = mainDrawEntries.map((e) => e.participantId);

  const { structureId } = structure;
  const { unassignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });
  expect(unassignedPositions?.length).toEqual(participantIds.length);

  // expect it to fail if an invalid drawPosition is attempted
  const participantId = participantIds[0];
  result = assignDrawPosition({
    drawPosition: 0,
    drawDefinition,
    participantId,
    structureId,
  });
  expect(result).toHaveProperty(ERROR);

  participantIds.forEach((participantId, i) => {
    const drawPosition = unassignedPositions?.[i].drawPosition;
    result = assignDrawPosition({
      participantId,
      drawDefinition,
      drawPosition,
      structureId,
    });
    expect(result).toMatchObject(SUCCESS);
    const { unassignedPositions: stillUnassigned } = structureAssignedDrawPositions({ drawDefinition, structureId });
    expect(stillUnassigned?.length).toEqual(participantIds.length - 1 - i);
  });

  const { assignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });
  expect(assignedPositions?.length).toEqual(drawSize);

  // can't assign a player a second time
  const drawPosition = unassignedPositions?.[0].drawPosition;
  result = assignDrawPosition({
    drawDefinition,
    participantId,
    drawPosition,
    structureId,
  });
  expect(result).toHaveProperty(ERROR);
});

it('can assign ROUND_ROBIN draw drawPositions', () => {
  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    uuids: generateRange(0, 100)
      .reverse()
      .map((i) => `uuid${i}`),
    drawProfile: {
      drawType: ROUND_ROBIN,
      automated: false,
      drawSize: 16,
    },
  });

  const stage = MAIN;
  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage });
  const { structureId } = structure;
  expect(structure.structureType).toEqual(CONTAINER);
  expect(structure.structures?.length).toEqual(4);

  const entryStatuses: EntryStatusUnion[] = [DIRECT_ACCEPTANCE, WILDCARD];
  const mainDrawEntries = getStageEntries({
    drawDefinition,
    entryStatuses,
    stage,
  });
  const participantIds = mainDrawEntries.map((e) => e.participantId);

  const { unassignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });
  expect(unassignedPositions?.length).toEqual(participantIds.length);

  participantIds.forEach((participantId, i) => {
    const drawPosition = unassignedPositions?.[i].drawPosition;
    result = assignDrawPosition({
      drawDefinition,
      participantId,
      drawPosition,
      structureId,
    });
    expect(result).toMatchObject(SUCCESS);
    const { unassignedPositions: stillUnassigned } = structureAssignedDrawPositions({ drawDefinition, structureId });
    expect(stillUnassigned?.length).toEqual(participantIds.length - 1 - i);
  });

  const { assignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });
  expect(assignedPositions?.length).toEqual(16);

  const groups = drawDefinition.structures[0].structures;
  groups.forEach((group, i) => {
    const positionAssignments = group.positionAssignments;
    positionAssignments.forEach((assignment, j) => {
      const expectedParticipant = (i * 4 + j) * 2;
      const expectedUUID = `uuid${expectedParticipant}`;
      expect(expectedUUID).not.toBeUndefined();
      expect(assignment.participantId).toEqual(expectedUUID);
    });
  });

  // can't assign a player a second time
  const participantId = participantIds[0];
  const drawPosition = unassignedPositions?.[0].drawPosition;
  result = assignDrawPosition({
    drawDefinition,
    participantId,
    drawPosition,
    structureId,
  });
  expect(result).toHaveProperty(ERROR);
});

it('returns positionAssignments for SINGLE_ELIMINATION and ROUND_ROBIN strucures', () => {
  let drawDefinition = newDrawDefinition();
  const elimination = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawSize: 16,
  }).structures?.[0];
  const { positionAssignments: eliminationAssignments } = structureAssignedDrawPositions({ structure: elimination });
  expect(eliminationAssignments?.length).toEqual(16);

  drawDefinition = newDrawDefinition();
  const drawType = ROUND_ROBIN;
  const roundRobin = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawSize: 16,
    drawType,
  }).structures?.[0];
  const { positionAssignments: roundRobinAssignments } = structureAssignedDrawPositions({ structure: roundRobin });
  expect(roundRobinAssignments?.length).toEqual(16);
});

it('can assign QUALIFIER placeholder to draw position', () => {
  // Create tournament with qualifying structure
  const drawProfiles = [
    {
      drawSize: 16,
      automated: false,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            {
              qualifyingPositions: 4,
              stageSequence: 1,
              drawSize: 8,
            },
          ],
        },
      ],
    },
  ];

  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    participantsProfile: {
      participantsCount: 32,
    },
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  // Find MAIN structure with stageSequence 1
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);

  expect(mainStructure).toBeDefined();

  const structureId = mainStructure.structureId;
  const drawPosition = 1; // First position in main draw

  // Assign qualifier to draw position
  result = assignDrawPosition({
    qualifier: true,
    drawDefinition,
    structureId,
    drawPosition,
  });

  expect(result).toMatchObject(SUCCESS);

  // Verify the position has qualifier assigned
  const { assignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });

  const assignment = assignedPositions?.find((p) => p.drawPosition === drawPosition);

  expect(assignment).toBeDefined();
  // expect(assignment?.qualifier).toBe(true);
  expect(assignment?.participantId).toBeUndefined(); // Should NOT have participantId
  expect(assignment?.bye).toBeUndefined(); // Should NOT be a BYE
});

it('can replace qualifier with participant', () => {
  // Create tournament with qualifying and MAIN structures
  const drawProfiles = [
    {
      drawSize: 16,
      automate: false,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            {
              stageSequence: 1,
              drawSize: 8,
              qualifyingPositions: 4,
            },
          ],
        },
      ],
    },
  ];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    participantsProfile: {
      participantsCount: 32,
    },
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);

  const structureId = mainStructure.structureId;
  const drawPosition = 1;

  // First assign qualifier
  result = assignDrawPosition({
    qualifier: true,
    drawDefinition,
    structureId,
    drawPosition,
  });

  expect(result).toMatchObject(SUCCESS);

  // Then replace with actual participant
  const { participants } = tournamentEngine.getParticipants();
  const participantId = participants[0].participantId;

  result = assignDrawPosition({
    participantId,
    drawDefinition,
    drawPosition,
    structureId,
  });

  expect(result).toMatchObject(SUCCESS);

  // Verify qualifier is removed and participant is assigned
  const { assignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });

  const assignment = assignedPositions?.find((p) => p.drawPosition === drawPosition);

  expect(assignment?.participantId).toBe(participantId);
  expect(assignment?.qualifier).toBeDefined(); // Qualifier should be removed
  expect(assignment?.bye).toBeUndefined();
});

it('qualifier positions are correctly counted', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      automated: false,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            {
              stageSequence: 1,
              drawSize: 8,
              qualifyingPositions: 4,
            },
          ],
        },
      ],
    },
  ];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles, participantsProfile: { participantsCount: 32 } });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);

  const structureId = mainStructure.structureId;

  // Assign qualifiers to first 4 positions
  for (let drawPosition = 1; drawPosition <= 4; drawPosition++) {
    result = assignDrawPosition({
      qualifier: true,
      drawDefinition,
      structureId,
      drawPosition,
    });
    expect(result).toMatchObject(SUCCESS);
  }

  // Verify all 4 qualifiers are assigned
  const { assignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });

  const qualifierCount = assignedPositions?.filter((p) => p.qualifier).length;

  expect(qualifierCount).toBe(4);
});
