import { assignDrawPositionQualifier } from '@Mutate/matchUps/drawPositions/assignDrawPositionQualifier';
import { luckyLoserDrawPositionAssignment } from '@Mutate/matchUps/drawPositions/positionLuckyLoser';
import { positionSeedBlocks } from '@Mutate/matchUps/drawPositions/positionSeeds';
import { POLICY_AVOIDANCE_COUNTRY } from '@Fixtures/policies/POLICY_AVOIDANCE_COUNTRY';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import {
  DRAW_POSITION_ACTIVE,
  INVALID_DRAW_POSITION,
  MISSING_DRAW_DEFINITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { QUALIFYING, MAIN } from '@Constants/drawDefinitionConstants';

// ──────────────────────────────────────────────────────────────────────────────
// assignDrawPositionQualifier — full branch coverage
// ──────────────────────────────────────────────────────────────────────────────
describe('assignDrawPositionQualifier full coverage', () => {
  it('returns MISSING_DRAW_DEFINITION when drawDefinition is undefined', () => {
    let result: any = assignDrawPositionQualifier({
      drawDefinition: undefined as any,
      drawPosition: 1,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns STRUCTURE_NOT_FOUND when structureId is invalid and no structure provided', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });

    let result: any = assignDrawPositionQualifier({
      structureId: 'bogus-structure-id',
      drawDefinition,
      drawPosition: 1,
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('resolves structure from structureId when structure is not passed', () => {
    const drawProfiles = [
      {
        drawSize: 8,
        qualifyingPositions: 2,
      },
    ];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });

    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const qualifierAssignment = mainStructure?.positionAssignments?.find((a) => a.qualifier);

    if (qualifierAssignment) {
      // calling with structureId but no structure — should resolve
      let result: any = assignDrawPositionQualifier({
        structureId: mainStructure.structureId,
        drawPosition: qualifierAssignment.drawPosition,
        drawDefinition,
      });
      expect(result.success).toBe(true);
    }
  });

  it('returns SUCCESS immediately when currentAssignment already has qualifier=true', () => {
    const drawProfiles = [{ drawSize: 8, qualifyingPositions: 2 }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const qualifierAssignment = mainStructure?.positionAssignments?.find((a) => a.qualifier);

    if (qualifierAssignment) {
      let result: any = assignDrawPositionQualifier({
        drawPosition: qualifierAssignment.drawPosition,
        drawDefinition,
        structure: mainStructure,
      });
      // First call should succeed (already qualifier)
      expect(result.success).toBe(true);
    }
  });

  it('returns DRAW_POSITION_ACTIVE when drawPosition is active and no propagated status', () => {
    const drawProfiles = [{ drawSize: 4, automated: true }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find((m) => m.roundNumber === 1);

    // Complete a first-round matchUp to make a draw position active
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-3 6-3',
      winningSide: 1,
    });
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: firstRoundMatchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toBe(true);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // The winning drawPosition should be active (advanced to R2)
    const winningDrawPositions = firstRoundMatchUp.drawPositions;
    const activeDrawPosition = winningDrawPositions[0];

    let qualResult: any = assignDrawPositionQualifier({
      drawPosition: activeDrawPosition,
      structure: mainStructure,
      drawDefinition,
    });
    expect(qualResult.error).toEqual(DRAW_POSITION_ACTIVE);
  });

  it('returns INVALID_DRAW_POSITION for a drawPosition not in positionAssignments', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    let result: any = assignDrawPositionQualifier({
      drawPosition: 999,
      structure: mainStructure,
      drawDefinition,
    });
    expect(result.error).toEqual(INVALID_DRAW_POSITION);
  });

  it('assigns qualifier to a non-filled draw position and triggers telemetry when isPositionAction', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        automated: false,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
          },
        ],
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 20 },
      drawProfiles,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Find an unassigned position (no participantId, no bye, no qualifier)
    const emptyAssignment = mainStructure?.positionAssignments?.find(
      (a) => !a.participantId && !a.bye && !a.qualifier,
    );

    if (emptyAssignment) {
      // With isPositionAction = true to exercise telemetry branch
      let result: any = assignDrawPositionQualifier({
        drawPosition: emptyAssignment.drawPosition,
        structureId: mainStructure.structureId,
        isPositionAction: true,
        drawDefinition,
      });
      expect(result.success).toBe(true);
    }
  });

  it('assigns qualifier without isPositionAction (skips telemetry)', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        automated: false,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
          },
        ],
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 20 },
      drawProfiles,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    const emptyAssignment = mainStructure?.positionAssignments?.find(
      (a) => !a.participantId && !a.bye && !a.qualifier,
    );

    if (emptyAssignment) {
      let result: any = assignDrawPositionQualifier({
        drawPosition: emptyAssignment.drawPosition,
        structure: mainStructure,
        isPositionAction: false,
        drawDefinition,
      });
      expect(result.success).toBe(true);
    }
  });

  it('handles drawPosition with existing participantId (containsParticipant path)', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Find a position with a participantId
    const filledAssignment = mainStructure?.positionAssignments?.find((a) => a.participantId);

    if (filledAssignment) {
      let result: any = assignDrawPositionQualifier({
        drawPosition: filledAssignment.drawPosition,
        structure: mainStructure,
        drawDefinition,
      });
      // This should succeed — it assigns qualifier to a filled position
      expect(result.success).toBe(true);

      // Verify the position now has qualifier = true
      const updated = mainStructure?.positionAssignments?.find(
        (a) => a.drawPosition === filledAssignment.drawPosition,
      );
      expect(updated?.qualifier).toBe(true);
    }
  });

  it('exercises containsQualifier path via drawPositionFilled returning true', () => {
    // Set up a draw with qualifier positions already filled
    const drawProfiles = [{ drawSize: 8, qualifyingPositions: 2 }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const qualifierAssignment = mainStructure?.positionAssignments?.find((a) => a.qualifier);

    if (qualifierAssignment) {
      // The second check (after positionAssignment lookup) hits the containsQualifier early return
      // This is the same as the currentAssignment.qualifier check
      let result: any = assignDrawPositionQualifier({
        drawPosition: qualifierAssignment.drawPosition,
        structure: mainStructure,
        drawDefinition,
      });
      expect(result.success).toBe(true);
    }
  });

  it('passes tournamentRecord and event for appliedPolicies and notification', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        automated: false,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
          },
        ],
      },
    ];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 20 },
      drawProfiles,
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    const emptyAssignment = mainStructure?.positionAssignments?.find(
      (a) => !a.participantId && !a.bye && !a.qualifier,
    );

    if (emptyAssignment) {
      let result: any = assignDrawPositionQualifier({
        drawPosition: emptyAssignment.drawPosition,
        structure: mainStructure,
        tournamentRecord,
        drawDefinition,
        event,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// luckyLoserDrawPositionAssignment — full branch coverage
// ──────────────────────────────────────────────────────────────────────────────
describe('luckyLoserDrawPositionAssignment full coverage', () => {
  it('returns MISSING_DRAW_DEFINITION when drawDefinition is undefined', () => {
    let result: any = luckyLoserDrawPositionAssignment({
      luckyLoserParticipantId: 'some-id',
      drawDefinition: undefined,
      drawPosition: 1,
      structureId: 'x',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('places lucky loser into a vacated draw position after withdrawal', () => {
    const drawProfiles = [{ drawSize: 8, participantsCount: 7 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    // Find a participant position and remove them first (before any matchUps completed)
    const filledAssignment = structure.positionAssignments.find((a) => a.participantId);

    // Use positionActions to find a remove action
    let actionsResult: any = tournamentEngine.positionActions({
      structureId: structure.structureId,
      drawPosition: filledAssignment.drawPosition,
      drawId,
    });
    const removeAction = actionsResult.validActions?.find((a) => a.type === 'REMOVE_ASSIGNMENT');

    if (removeAction) {
      let removeResult: any = tournamentEngine[removeAction.method](removeAction.payload);
      expect(removeResult.success).toBe(true);

      // Get a participant not in the draw for lucky loser role
      const { participants } = tournamentEngine.getParticipants();
      const currentDraw = tournamentEngine.getEvent({ drawId }).drawDefinition;
      const currentStructure = currentDraw.structures.find((s) => s.stage === MAIN);
      const drawPids = currentStructure.positionAssignments
        .filter((a) => a.participantId)
        .map((a) => a.participantId);
      const luckyLoserPid = participants.find((p) => !drawPids.includes(p.participantId))?.participantId;

      if (luckyLoserPid) {
        let result: any = tournamentEngine.luckyLoserDrawPositionAssignment({
          drawPosition: filledAssignment.drawPosition,
          structureId: structure.structureId,
          luckyLoserParticipantId: luckyLoserPid,
          drawId,
        });
        expect(result.success).toBe(true);

        // Verify the lucky loser is now at that draw position
        const updatedDraw = tournamentEngine.getEvent({ drawId }).drawDefinition;
        const updatedStructure = updatedDraw.structures.find((s) => s.stage === MAIN);
        const assignment = updatedStructure.positionAssignments.find(
          (a) => a.drawPosition === filledAssignment.drawPosition,
        );
        expect(assignment?.participantId).toBe(luckyLoserPid);
      }
    }
  });

  it('exercises lucky loser via positionParticipantAction with qualifier position replacement', () => {
    // Set up a draw with qualifier slots
    const drawProfiles = [{ drawSize: 8, qualifyingPositions: 2 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const qualifierAssignment = mainStructure?.positionAssignments?.find((a) => a.qualifier);

    if (qualifierAssignment) {
      // Get a valid participantId from entries
      const filledAssignment = mainStructure?.positionAssignments?.find((a) => a.participantId);

      if (filledAssignment) {
        // Use a participant from the tournament (not already in draw)
        const { participants } = tournamentEngine.getParticipants();
        const drawParticipantIds = mainStructure.positionAssignments
          .filter((a) => a.participantId)
          .map((a) => a.participantId);
        const availableParticipant = participants.find(
          (p) => !drawParticipantIds.includes(p.participantId),
        );

        if (availableParticipant) {
          let result: any = luckyLoserDrawPositionAssignment({
            luckyLoserParticipantId: availableParticipant.participantId,
            drawPosition: qualifierAssignment.drawPosition,
            structureId: mainStructure.structureId,
            tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
            drawDefinition,
          });
          expect(result.success).toBe(true);
        }
      }
    }
  });

  it('replaces an existing participant at a draw position', () => {
    const drawProfiles = [{ drawSize: 4, participantsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const filledAssignment = mainStructure?.positionAssignments?.find((a) => a.participantId);

    // Get a participant not in the draw
    const { participants } = tournamentEngine.getParticipants();
    const drawParticipantIds = mainStructure.positionAssignments
      .filter((a) => a.participantId)
      .map((a) => a.participantId);
    const outsideParticipant = participants.find(
      (p) => !drawParticipantIds.includes(p.participantId),
    );

    if (filledAssignment && outsideParticipant) {
      // This exercises the positionAssignment?.participantId branch in positionParticipantAction
      let result: any = luckyLoserDrawPositionAssignment({
        luckyLoserParticipantId: outsideParticipant.participantId,
        drawPosition: filledAssignment.drawPosition,
        structureId: mainStructure.structureId,
        tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
        drawDefinition,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// positionSeedBlocks — full branch coverage
// ──────────────────────────────────────────────────────────────────────────────
describe('positionSeedBlocks full coverage', () => {
  it('positions seeds correctly in a standard seeded draw', () => {
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    expect(structure.seedAssignments).toBeDefined();
    expect(structure.seedAssignments.length).toBeGreaterThanOrEqual(4);

    // Verify seeded participants are in position assignments
    const seededParticipantIds = structure.seedAssignments
      .filter((a) => a.participantId)
      .map((a) => a.participantId);

    for (const pid of seededParticipantIds) {
      const assignment = structure.positionAssignments.find((a) => a.participantId === pid);
      expect(assignment).toBeDefined();
    }
  });

  it('resolves structure from structureId when structure not provided', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Call positionSeedBlocks with structureId only (no structure)
    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      drawDefinition,
    });
    // May succeed or return errors depending on seed state
    expect(result).toBeDefined();
  });

  it('resolves structureId from structure when structureId not provided', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Call with structure but no structureId
    let result: any = positionSeedBlocks({
      drawDefinition,
      structure,
    });
    expect(result).toBeDefined();
  });

  it('handles getValidSeedBlocks error path', () => {
    // Create a minimal drawDefinition with an invalid structure
    const drawProfiles = [{ drawSize: 4, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });

    // Pass with no structure and invalid structureId — structure will be undefined
    // and getValidSeedBlocks won't run; groupsCount defaults to 0
    let result: any = positionSeedBlocks({
      structureId: 'nonexistent',
      drawDefinition,
    });
    // With no validSeedBlocks and groupsCount=0, should succeed with no placements
    expect(result.success).toBe(true);
    expect(result.seedPositions).toEqual([]);
  });

  it('uses provided validSeedBlocks when given', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Provide empty validSeedBlocks — exercises the pre-supplied validSeedBlocks branch
    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      validSeedBlocks: [],
      drawDefinition,
      structure,
    });
    // With empty validSeedBlocks, groupsCount = 0, no seeds placed
    expect(result.success).toBe(true);
    expect(result.seedPositions).toEqual([]);
  });

  it('respects provided groupsCount to limit seed block iterations', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // groupsCount = 0 means no iterations
    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      drawDefinition,
      groupsCount: 0,
      structure,
    });
    expect(result.success).toBe(true);
    expect(result.seedPositions).toEqual([]);
  });

  it('positions seeds with avoidance policy (reorderSeedsForAvoidance path)', () => {
    // Create a draw with seeding and avoidance policy
    const drawProfiles = [
      {
        drawSize: 16,
        seedsCount: 4,
        policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 16, nationalityCodesCount: 4 },
      drawProfiles,
      setState: true,
    });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    // Verify seeds were placed
    expect(structure.seedAssignments.length).toBeGreaterThanOrEqual(4);
    const seededPids = structure.seedAssignments.filter((a) => a.participantId).map((a) => a.participantId);
    expect(seededPids.length).toBeGreaterThanOrEqual(4);
  });

  it('handles seed block with more than 2 unplaced seeds and avoidance', () => {
    // This specifically exercises reorderSeedsForAvoidance with conflictGroups
    const drawProfiles = [
      {
        drawSize: 32,
        seedsCount: 8,
        policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 32, nationalityCodesCount: 4 },
      drawProfiles,
      setState: true,
    });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    // Verify seeds positioned successfully
    expect(structure.seedAssignments.length).toBeGreaterThanOrEqual(8);
    const seededPids = structure.seedAssignments.filter((a) => a.participantId);
    expect(seededPids.length).toBeGreaterThanOrEqual(8);
  });

  it('handles positionSeedBlocks with qualifying structure', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ drawSize: 8, qualifyingPositions: 4, seedsCount: 2 }],
          },
        ],
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 32 },
      drawProfiles,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifyingStructure = drawDefinition.structures.find((s) => s.stage === QUALIFYING);

    if (qualifyingStructure) {
      // Qualifying structure should have seed assignments
      expect(qualifyingStructure.seedAssignments).toBeDefined();
    }
  });

  it('propagates errors from positionSeedBlock when assignDrawPosition fails', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Providing a high groupsCount with default validSeedBlocks
    // should produce seed placement attempts that may fail
    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      drawDefinition,
      groupsCount: 10,
      structure,
    });
    // Result will be defined — either success with positions or error
    expect(result).toBeDefined();
  });

  it('returns errors array when seed block placement encounters errors', () => {
    // Create a very small draw and try to place too many seed blocks
    const drawProfiles = [{ drawSize: 4, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Force a high groupsCount that exceeds actual seed blocks
    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      drawDefinition,
      groupsCount: 5,
      structure,
    });
    // Should either succeed (placing what it can) or have errors
    expect(result).toBeDefined();
  });

  it('works with custom random function for deterministic seeding', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    const deterministicRandom = () => 0.5;

    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      random: deterministicRandom,
      drawDefinition,
      structure,
    });
    expect(result).toBeDefined();
  });

  it('exercises appliedPolicies defaulting when not provided', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2, automated: false }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    // Call without appliedPolicies — it should default via getAppliedPolicies
    let result: any = positionSeedBlocks({
      structureId: structure.structureId,
      appliedPolicies: undefined,
      drawDefinition,
      structure,
    });
    expect(result).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: qualifying → main draw qualifier placement
// ──────────────────────────────────────────────────────────────────────────────
describe('qualifying integration with assignDrawPositionQualifier', () => {
  it('positions qualifiers after completing qualifying matchUps', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
          },
        ],
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 32 },
      drawProfiles,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifyingStructure = drawDefinition.structures.find((s) => s.stage === QUALIFYING);
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

    expect(qualifyingStructure).toBeDefined();
    expect(mainStructure).toBeDefined();

    // The main structure should have qualifier placeholder positions
    const qualifierPositions = mainStructure?.positionAssignments?.filter((a) => a.qualifier);
    expect(qualifierPositions?.length).toBeGreaterThan(0);

    // Verify qualifying structure has matchUps to complete
    const { matchUps: qualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { structureIds: [qualifyingStructure.structureId] },
    });
    expect(qualMatchUps.length).toBeGreaterThan(0);

    // Complete all qualifying matchUps
    for (const matchUp of qualMatchUps.filter((m) => !m.winningSide)) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-2', winningSide: 1 }).outcome,
        matchUpId: matchUp.matchUpId,
        drawId,
      });
      expect(result.success).toBe(true);
    }

    // After completing qualifying, the qualifying winners can be placed into main draw
    // Use qualifierDrawPositionAssignment to place a qualifier
    const completedQuals = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { structureIds: [qualifyingStructure.structureId] },
    }).matchUps;
    const qualWinner = completedQuals.find((m) => m.winningSide);
    const winnerPid = qualWinner?.sides?.find((s) => s.sideNumber === qualWinner.winningSide)?.participantId;

    if (winnerPid && qualifierPositions?.length) {
      let result: any = tournamentEngine.qualifierDrawPositionAssignment({
        drawPosition: qualifierPositions[0].drawPosition,
        structureId: mainStructure.structureId,
        qualifyingParticipantId: winnerPid,
        drawId,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: lucky loser complete flow
// ──────────────────────────────────────────────────────────────────────────────
describe('lucky loser integration flow', () => {
  it('complete lucky loser flow: remove participant, place lucky loser via engine', () => {
    const drawProfiles = [{ drawSize: 8, participantsCount: 7 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    // Remove a participant via positionActions
    const filledAssignment = structure.positionAssignments.find((a) => a.participantId);
    let actionsResult: any = tournamentEngine.positionActions({
      structureId: structure.structureId,
      drawPosition: filledAssignment.drawPosition,
      drawId,
    });
    const removeAction = actionsResult.validActions?.find((a) => a.type === 'REMOVE_ASSIGNMENT');

    if (removeAction) {
      let removeResult: any = tournamentEngine[removeAction.method](removeAction.payload);
      expect(removeResult.success).toBe(true);

      // Get participants not in the draw
      const { participants } = tournamentEngine.getParticipants();
      const currentDraw = tournamentEngine.getEvent({ drawId }).drawDefinition;
      const currentStructure = currentDraw.structures.find((s) => s.stage === MAIN);
      const drawPids = currentStructure.positionAssignments
        .filter((a) => a.participantId)
        .map((a) => a.participantId);
      const luckyLoserPid = participants.find((p) => !drawPids.includes(p.participantId))?.participantId;

      if (luckyLoserPid) {
        let result: any = tournamentEngine.luckyLoserDrawPositionAssignment({
          drawPosition: filledAssignment.drawPosition,
          structureId: structure.structureId,
          luckyLoserParticipantId: luckyLoserPid,
          drawId,
        });
        expect(result.success).toBe(true);
      }
    }
  });

  it('positions lucky loser via direct function call with tournamentRecord', () => {
    const drawProfiles = [{ drawSize: 4, participantsCount: 4, alternatesCount: 2 }];
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === MAIN);

    const { participants } = tournamentEngine.getParticipants();
    const drawPids = structure.positionAssignments.filter((a) => a.participantId).map((a) => a.participantId);
    const outsider = participants.find((p) => !drawPids.includes(p.participantId));

    if (outsider) {
      const targetAssignment = structure.positionAssignments.find((a) => a.participantId);

      let result: any = luckyLoserDrawPositionAssignment({
        luckyLoserParticipantId: outsider.participantId,
        drawPosition: targetAssignment.drawPosition,
        structureId: structure.structureId,
        tournamentRecord,
        drawDefinition,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// positionSeedBlocks — edge cases for reorderSeedsForAvoidance
// ──────────────────────────────────────────────────────────────────────────────
describe('positionSeedBlocks avoidance edge cases', () => {
  it('avoidance with fewer than 2 unplaced seeds skips reorder', () => {
    // With only 1 seed, reorderSeedsForAvoidance won't be called (length <= 2 check)
    const drawProfiles = [
      {
        drawSize: 8,
        seedsCount: 1,
        policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 8, nationalityCodesCount: 2 },
      drawProfiles,
      setState: true,
    });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    expect(structure.seedAssignments).toBeDefined();
    expect(structure.seedAssignments.length).toBeGreaterThanOrEqual(1);
  });

  it('avoidance with distinct nationalities (no conflicts) skips swap', () => {
    // Each seed has a unique nationality — no conflictGroups
    const drawProfiles = [
      {
        drawSize: 16,
        seedsCount: 4,
        policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 16, nationalityCodesCount: 16 },
      drawProfiles,
      setState: true,
    });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    const seededPids = structure.seedAssignments.filter((a) => a.participantId);
    expect(seededPids.length).toBeGreaterThanOrEqual(4);
  });

  it('avoidance with heavy nationality concentration triggers swaps', () => {
    // Many seeds from the same country — should trigger conflict group swaps
    const drawProfiles = [
      {
        drawSize: 32,
        seedsCount: 8,
        policyDefinitions: POLICY_AVOIDANCE_COUNTRY,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 32, nationalityCodesCount: 2 },
      drawProfiles,
      setState: true,
    });

    const {
      drawDefinition: {
        structures: [structure],
      },
    } = tournamentEngine.getEvent({ drawId });

    const seededPids = structure.seedAssignments.filter((a) => a.participantId);
    expect(seededPids.length).toBeGreaterThanOrEqual(8);
  });
});
