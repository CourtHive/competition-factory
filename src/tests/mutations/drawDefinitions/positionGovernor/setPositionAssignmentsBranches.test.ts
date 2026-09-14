import { setPositionAssignments } from '@Mutate/drawDefinitions/positionGovernor/setPositionAssignments';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

// --- Direct function error path tests ---

test('setPositionAssignments returns MISSING_DRAW_DEFINITION when no drawDefinition', () => {
  const result = setPositionAssignments({
    structurePositionAssignments: [],
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

test('setPositionAssignments returns INVALID_VALUES when structurePositionAssignments is not an array', () => {
  const result = setPositionAssignments({
    drawDefinition: { structures: [] } as any,
    structurePositionAssignments: 'not-an-array' as any,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  const result2 = setPositionAssignments({
    drawDefinition: { structures: [] } as any,
    structurePositionAssignments: null as any,
  });
  expect(result2.error).toEqual(INVALID_VALUES);
});

test('setPositionAssignments continues when positionAssignments is falsy', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Pass an entry with no positionAssignments - should continue and succeed
  const result = setPositionAssignments({
    drawDefinition,
    structurePositionAssignments: [{ structureId, positionAssignments: undefined }],
  });
  expect(result.success).toEqual(true);
});

test('setPositionAssignments returns error for invalid structureId', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const result = setPositionAssignments({
    drawDefinition,
    structurePositionAssignments: [
      {
        structureId: 'nonexistent-structure-id',
        positionAssignments: [{ drawPosition: 1 }],
      },
    ],
  });
  expect(result.error).toBeDefined();
});

test('setPositionAssignments returns INVALID_VALUES when drawPositions do not match', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Submit draw positions that don't match the structure's positions
  const result = setPositionAssignments({
    drawDefinition,
    structurePositionAssignments: [
      {
        structureId,
        positionAssignments: [{ drawPosition: 99 }, { drawPosition: 100 }],
      },
    ],
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.info).toContain('drawPositions do not match');
});

// --- Engine-level tests for assignment branches ---

test('setPositionAssignments handles qualifier flag assignments', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 24 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);

  if (result.structurePositionAssignments?.length) {
    // Modify first assignment to be a qualifier instead of a participant
    const firstSpa = result.structurePositionAssignments[0];
    const qualifierAssignment = firstSpa.positionAssignments.find((a) => a.participantId);
    if (qualifierAssignment) {
      qualifierAssignment.qualifier = true;
      delete qualifierAssignment.participantId;
    }

    const setResult = tournamentEngine.setPositionAssignments({
      structurePositionAssignments: result.structurePositionAssignments,
      drawId,
    });
    expect(setResult.success).toEqual(true);

    // Verify the qualifier was set
    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId: firstSpa.structureId,
      drawId,
    });
    const qualifiers = positionAssignments.filter((a) => a.qualifier && !a.participantId);
    expect(qualifiers.length).toBeGreaterThanOrEqual(1);
  }
});

test('setPositionAssignments handles bye assignments', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 24 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);

  if (result.structurePositionAssignments?.length) {
    // Verify the assignments include byes (RR playoffs typically have some)
    const hasByes = result.structurePositionAssignments.some((spa) => spa.positionAssignments.some((a) => a.bye));

    const setResult = tournamentEngine.setPositionAssignments({
      structurePositionAssignments: result.structurePositionAssignments,
      drawId,
    });
    expect(setResult.success).toEqual(true);

    if (hasByes) {
      // Verify byes were assigned
      const { positionAssignments } = tournamentEngine.getPositionAssignments({
        structureId: result.structurePositionAssignments[0].structureId,
        drawId,
      });
      expect(positionAssignments.some((a) => a.bye)).toBe(true);
    }
  }
});

test('setPositionAssignments with multiple structures from playoff positioning', () => {
  // Use completionGoal: 23 to leave 1 matchUp incomplete, so playoff positions are NOT yet assigned
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 23 }],
    setState: true,
  });

  // Complete the remaining matchUp
  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(upcomingMatchUps.length).toEqual(1);
  const { matchUpId } = upcomingMatchUps[0];
  tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome: { winningSide: 1 },
    drawId,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.structurePositionAssignments.length).toBeGreaterThanOrEqual(1);

  const setResult = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: result.structurePositionAssignments,
    drawId,
  });
  expect(setResult.success).toEqual(true);
});

test('setPositionAssignments with provisionalPositioning', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 23 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    provisionalPositioning: true,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Apply with provisionalPositioning flag
  const setResult = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: result.structurePositionAssignments,
    provisionalPositioning: true,
    drawId,
  });
  expect(setResult.success).toEqual(true);
});

test('setPositionAssignments with empty structurePositionAssignments array', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  const result = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [],
    drawId,
  });
  expect(result.success).toEqual(true);
});

// --- Direct function call to test qualifier branch more explicitly ---

test('setPositionAssignments direct call exercises qualifier branch', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, automated: false }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const structureId = structure.structureId;

  // Build submitted assignments: some with qualifier, some with neither
  // The qualifier branch modifies the submitted positionAssignments array in-place
  const submittedAssignments = structure.positionAssignments.map((a) => ({ ...a }));
  // Mark first two as qualifiers (no bye, no participantId)
  submittedAssignments[0].qualifier = true;
  submittedAssignments[1].qualifier = true;

  const result = setPositionAssignments({
    drawDefinition,
    structurePositionAssignments: [
      {
        structureId,
        positionAssignments: submittedAssignments,
      },
    ],
  });
  expect(result.success).toEqual(true);

  // The qualifier branch sets qualifier=true and deletes participantId/bye on the submitted array
  expect(submittedAssignments[0].qualifier).toBe(true);
  expect(submittedAssignments[0].participantId).toBeUndefined();
  expect(submittedAssignments[0].bye).toBeUndefined();
});

test('setPositionAssignments direct call with mixed bye/qualifier/participant assignments', () => {
  // Use completionGoal: 23 to leave playoffs unassigned
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 23 }],
    setState: true,
  });

  // Complete the remaining matchUp
  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  if (upcomingMatchUps.length) {
    tournamentEngine.setMatchUpStatus({
      matchUpId: upcomingMatchUps[0].matchUpId,
      outcome: { winningSide: 1 },
      drawId,
    });
  }

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);

  if (result.structurePositionAssignments?.length) {
    const spa = result.structurePositionAssignments[0];

    // Check that the assignments contain a mix of types
    const hasByes = spa.positionAssignments.some((a) => a.bye);
    const hasParticipants = spa.positionAssignments.some((a) => a.participantId);
    expect(hasByes || hasParticipants).toBe(true);

    const setResult = tournamentEngine.setPositionAssignments({
      structurePositionAssignments: result.structurePositionAssignments,
      drawId,
    });
    expect(setResult.success).toEqual(true);
  }
});
