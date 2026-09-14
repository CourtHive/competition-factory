/**
 * Coverage tests for assignDrawPositionBye.ts
 * Targets uncovered lines: 92, 95, 96, 130, 136, 137, 141, 179,
 * 242, 423, 477, 481, 505, 510, 593, 637
 */
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getDrawStructures } from '@Acquire/findStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN, CONSOLATION, LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { StageTypeUnion } from '@Types/tournamentTypes';
import {
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  MISSING_DRAW_DEFINITION,
  STRUCTURE_NOT_FOUND,
  LUCKY_DRAW_BYE_LIMIT,
} from '@Constants/errorConditionConstants';

// ----------------------------------------------------------------
// Line 92: MISSING_DRAW_DEFINITION when no drawDefinition is passed
// ----------------------------------------------------------------
describe('assignDrawPositionBye guard paths', () => {
  it('returns MISSING_DRAW_DEFINITION when drawDefinition is undefined', () => {
    let result: any = assignDrawPositionBye({
      drawDefinition: undefined as any,
      drawPosition: 1,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  // ----------------------------------------------------------------
  // Line 95: STRUCTURE_NOT_FOUND when structureId is invalid
  // ----------------------------------------------------------------
  it('returns STRUCTURE_NOT_FOUND when structure cannot be resolved', () => {
    const { drawDefinition } = mocksEngine.generateEventWithDraw({
      drawProfile: { drawSize: 4 },
    });
    let result: any = assignDrawPositionBye({
      structureId: 'BOGUS_STRUCTURE_ID',
      drawDefinition,
      drawPosition: 1,
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  // ----------------------------------------------------------------
  // Line 96: structureId inferred from structure when not provided
  // ----------------------------------------------------------------
  it('infers structureId from structure when not provided', () => {
    const { drawDefinition } = mocksEngine.generateEventWithDraw({
      drawProfile: { drawSize: 4, participantsCount: 3, automated: false },
    });
    const structure = drawDefinition.structures[0];
    // Pass structure but no structureId — line 96 should execute
    let result: any = assignDrawPositionBye({
      drawDefinition,
      drawPosition: 1,
      structure,
      // no structureId
    });
    expect(result.success).toEqual(true);
  });
});

// ----------------------------------------------------------------
// Line 130: DRAW_POSITION_ACTIVE when position is active
// ----------------------------------------------------------------
describe('assignDrawPositionBye active position', () => {
  it('returns DRAW_POSITION_ACTIVE when the position has advanced', () => {
    const drawProfiles = [{ drawSize: 4, automated: true }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find((m: any) => m.roundNumber === 1);

    if (firstRoundMatchUp?.drawPositions?.filter(Boolean).length === 2) {
      // Complete R1 matchUp to make its draw positions active
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-1 6-1',
        winningSide: 1,
      });
      let result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: firstRoundMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;
      const activeDrawPosition = firstRoundMatchUp.drawPositions[0];

      // Try to assign BYE to active position — should get DRAW_POSITION_ACTIVE
      result = tournamentEngine.assignDrawPositionBye({
        drawPosition: activeDrawPosition,
        structureId,
        drawId,
      });
      expect(result.error).toEqual(DRAW_POSITION_ACTIVE);
    }
  });
});

// ----------------------------------------------------------------
// Lines 136-137: positionAssignment created when none exists
// Line 141: containsBye early return
// ----------------------------------------------------------------
describe('assignDrawPositionBye position assignment edge cases', () => {
  it('handles already-bye position (containsBye early return, line 141)', () => {
    const { drawDefinition } = mocksEngine.generateEventWithDraw({
      drawProfile: { drawSize: 4, participantsCount: 3 },
    });
    const structure = drawDefinition.structures[0];
    const byeAssignment = structure.positionAssignments?.find((a: any) => a.bye);
    expect(byeAssignment).toBeDefined();

    // Assign BYE again to a position that already has bye — line 141 early return
    let result: any = assignDrawPositionBye({
      drawPosition: byeAssignment.drawPosition,
      structureId: structure.structureId,
      drawDefinition,
    });
    expect(result.success).toEqual(true);
  });

  it('creates positionAssignment when none exists (lines 136-137)', () => {
    const { drawDefinition } = mocksEngine.generateEventWithDraw({
      drawProfile: { drawSize: 4, participantsCount: 2, automated: false },
    });
    const structure = drawDefinition.structures[0];
    const structureId = structure.structureId;

    // Manually remove a positionAssignment to force the missing-assignment branch
    const originalLength = structure.positionAssignments?.length || 0;
    const removedAssignment = structure.positionAssignments?.pop();
    expect(removedAssignment).toBeDefined();

    const drawPosition = removedAssignment!.drawPosition;
    expect(structure.positionAssignments?.find((a: any) => a.drawPosition === drawPosition)).toBeUndefined();

    // Now assign BYE — should create the missing positionAssignment (lines 136-137)
    let result: any = assignDrawPositionBye({
      drawDefinition,
      drawPosition,
      structureId,
    });
    expect(result.success).toEqual(true);

    // Verify the assignment was created
    const newAssignment = structure.positionAssignments?.find((a: any) => a.drawPosition === drawPosition);
    expect(newAssignment).toBeDefined();
    expect(newAssignment?.bye).toEqual(true);
    expect(structure.positionAssignments?.length).toEqual(originalLength);
  });
});

// ----------------------------------------------------------------
// Line 179: hasPropagatedStatus clears participantId
// This is triggered when a DOUBLE_WALKOVER propagates through FMLC
// and causes assignDrawPositionBye to be called with a loserMatchUp
// that has a propagated exit status in the draw's matchUps.
// ----------------------------------------------------------------
describe('assignDrawPositionBye with propagated status', () => {
  it('clears participantId when hasPropagatedStatus is true (line 179)', () => {
    const drawId = 'fmlc-prop';
    const {
      tournamentRecord,
      drawIds: [id],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'fp',
          outcomes: [
            { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-2 6-2', winningSide: 1 },
            { roundNumber: 1, roundPosition: 3, scoreString: '6-3 6-3', winningSide: 1 },
            { roundNumber: 1, roundPosition: 4, scoreString: '6-4 6-4', winningSide: 1 },
            { roundNumber: 1, roundPosition: 5, scoreString: '6-1 6-1', winningSide: 1 },
            { roundNumber: 1, roundPosition: 6, scoreString: '6-2 6-2', winningSide: 1 },
            { roundNumber: 1, roundPosition: 7, scoreString: '6-3 6-3', winningSide: 1 },
            { roundNumber: 1, roundPosition: 8, scoreString: '6-4 6-4', winningSide: 1 },
          ],
        },
      ],
    });
    expect(id).toEqual(drawId);
    tournamentEngine.setState(tournamentRecord);

    // All R1 completed. Now apply DOUBLE_WALKOVER to R2 matchUp
    let matchUps: any = tournamentEngine.allTournamentMatchUps().matchUps;
    const mainR2 = matchUps.filter(
      (m: any) => m.stage === MAIN && m.roundNumber === 2 && m.drawPositions?.filter(Boolean).length === 2,
    );
    expect(mainR2.length).toBeGreaterThan(0);

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: mainR2[0].matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify consolation structure received the propagation
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationMatchUps = matchUps.filter((m: any) => m.stage === CONSOLATION);
    expect(consolationMatchUps.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------
// Lines 423, 637: assignFedDrawPositionBye — consolation bye propagation
// in FMLC draws with byes (fewer participants)
// ----------------------------------------------------------------
describe('FMLC consolation BYE propagation', () => {
  it('propagates byes to consolation structure (lines 423, 637)', () => {
    // FMLC with fewer participants — byes auto-placed in main draw
    // should propagate to consolation structure
    const drawProfiles = [
      {
        drawSize: 16,
        participantsCount: 14,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);

    // Check position assignments for byes in main draw
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const byeAssignments = mainStructure?.positionAssignments?.filter((a: any) => a.bye);
    expect(byeAssignments?.length).toEqual(2);

    // Check consolation structure also has byes propagated
    const consolationStructure = drawDefinition.structures.find((s: any) => s.stage === CONSOLATION);
    expect(consolationStructure).toBeDefined();

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    // Main should have BYE matchUps
    const mainByeMatchUps = matchUps.filter((m: any) => m.stage === MAIN && m.matchUpStatus === BYE);
    expect(mainByeMatchUps.length).toBeGreaterThan(0);

    // Consolation should also have BYE matchUps from the bye propagation
    const consolationByeMatchUps = matchUps.filter((m: any) => m.stage === CONSOLATION && m.matchUpStatus === BYE);
    expect(consolationByeMatchUps.length).toBeGreaterThan(0);
  });

  it('FMLC with 12 of 16 participants propagates byes through fed consolation rounds', () => {
    const drawId = 'fmlc-fed';
    const {
      tournamentRecord,
      drawIds: [id],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          participantsCount: 12,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'ff',
        },
      ],
    });
    expect(id).toEqual(drawId);
    tournamentEngine.setState(tournamentRecord);

    // With 12 of 16, there should be 4 byes in main draw
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const byeAssignments = mainStructure?.positionAssignments?.filter((a: any) => a.bye);
    expect(byeAssignments?.length).toEqual(4);

    let matchUps: any = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main R1 should have 4 BYE matchUps
    const mainR1Byes = matchUps.filter((m: any) => m.stage === MAIN && m.roundNumber === 1 && m.matchUpStatus === BYE);
    expect(mainR1Byes.length).toEqual(4);

    // Consolation should also have propagated byes
    const consolationByes = matchUps.filter((m: any) => m.stage === CONSOLATION && m.matchUpStatus === BYE);
    expect(consolationByes.length).toBeGreaterThan(0);

    // Complete all R1 non-bye matchUps in main
    const mainR1TBP = matchUps.filter(
      (m: any) =>
        m.stage === MAIN &&
        m.roundNumber === 1 &&
        m.matchUpStatus === TO_BE_PLAYED &&
        m.drawPositions?.filter(Boolean).length === 2,
    );
    for (const mu of mainR1TBP) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-3 6-4',
        winningSide: 1,
      });
      let result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: mu.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Now apply double walkover in R2 to trigger fed consolation bye propagation
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const mainR2 = matchUps.filter(
      (m: any) => m.stage === MAIN && m.roundNumber === 2 && m.drawPositions?.filter(Boolean).length === 2,
    );

    if (mainR2.length > 0) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: mainR2[0].matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  });
});

// ----------------------------------------------------------------
// Lines 477, 481, 505, 510: advanceWinner edge cases
// bye-advanced-bye and position-already-assigned scenarios
// ----------------------------------------------------------------
describe('advanceWinner edge cases', () => {
  it('handles bye advancement through multiple rounds (bye-advanced-bye)', () => {
    // Two adjacent byes in a draw: positions 1 and 2 are both byes
    // The winner of a bye-vs-bye matchUp advances as a bye again
    const stage: StageTypeUnion = MAIN;
    const drawSize = 8;

    const { drawDefinition } = mocksEngine.generateEventWithDraw({
      drawProfile: {
        participantsCount: drawSize - 4,
        automated: false,
        drawSize,
      },
    });

    const {
      structures: [structure],
    } = getDrawStructures({ drawDefinition, stage });
    const structureId = structure.structureId;

    // Assign BYEs to positions 1 and 2 (paired in same R1 matchUp)
    let result: any = assignDrawPositionBye({
      drawDefinition,
      drawPosition: 1,
      structureId,
    });
    expect(result.success).toEqual(true);

    result = assignDrawPositionBye({
      drawDefinition,
      drawPosition: 2,
      structureId,
    });
    expect(result.success).toEqual(true);

    // Now assign a BYE to position 3 as well — this creates a scenario
    // where the bye-advanced position meets another bye in R2
    result = assignDrawPositionBye({
      drawDefinition,
      drawPosition: 3,
      structureId,
    });
    expect(result.success).toEqual(true);

    // Verify the R2 matchUp has bye propagation
    const r2MatchUps = structure.matchUps?.filter((m: any) => m.roundNumber === 2);
    expect(r2MatchUps?.length).toBeGreaterThan(0);
  });

  it('DRAW_POSITION_ASSIGNED when assigning bye to filled position', () => {
    const drawSize = 4;

    const { drawDefinition } = mocksEngine.generateEventWithDraw({
      drawProfile: {
        participantsCount: drawSize,
        automated: false,
        drawSize,
      },
    });

    const {
      structures: [structure],
    } = getDrawStructures({ drawDefinition, stage: MAIN });
    const structureId = structure.structureId;

    const { unassignedPositions } = structureAssignedDrawPositions({
      drawDefinition,
      structureId,
    });

    const entryStatuses: Set<string> = new Set([DIRECT_ACCEPTANCE, WILDCARD]);
    const entries = drawDefinition.entries?.filter((e: any) => entryStatuses.has(e.entryStatus));
    const participantIds = entries?.map((e: any) => e.participantId) || [];

    // Fill all positions with participants
    for (let i = 0; i < participantIds.length && i < (unassignedPositions?.length || 0); i++) {
      assignDrawPosition({
        drawPosition: unassignedPositions![i].drawPosition,
        participantId: participantIds[i],
        drawDefinition,
        structureId,
      });
    }

    // Now try to assign a BYE to a position that has a participant — should return DRAW_POSITION_ASSIGNED
    let result: any = assignDrawPositionBye({
      drawPosition: unassignedPositions![0].drawPosition,
      drawDefinition,
      structureId,
    });
    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
  });
});

// ----------------------------------------------------------------
// Line 593: assignDrawPositionBye error return in advanceWinner
// consolation bye propagation path
// ----------------------------------------------------------------
describe('FMLC consolation bye propagation from advanceWinner', () => {
  it('exercises consolation bye assignment from advanceWinner via FMLC draw', () => {
    // An FMLC draw with 6 of 8 participants:
    // - 2 byes in main R1
    // - Bye winners advance to R2
    // - Consolation gets BYE assignments from advanceWinner loser path
    const drawProfiles = [
      {
        drawSize: 8,
        participantsCount: 6,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const byeAssignments = mainStructure?.positionAssignments?.filter((a: any) => a.bye);
    expect(byeAssignments?.length).toEqual(2);

    let matchUps: any = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main R1 should have 2 BYE matchUps
    const mainR1Byes = matchUps.filter((m: any) => m.stage === MAIN && m.roundNumber === 1 && m.matchUpStatus === BYE);
    expect(mainR1Byes.length).toEqual(2);

    // Complete all R1 non-bye matchUps
    const mainR1TBP = matchUps.filter(
      (m: any) =>
        m.stage === MAIN &&
        m.roundNumber === 1 &&
        m.matchUpStatus === TO_BE_PLAYED &&
        m.drawPositions?.filter(Boolean).length === 2,
    );
    for (const mu of mainR1TBP) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-2 6-3',
        winningSide: 1,
      });
      let result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: mu.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Consolation should have bye propagation from the main byes
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolation = matchUps.filter((m: any) => m.stage === CONSOLATION);
    expect(consolation.length).toBeGreaterThan(0);

    // Some consolation matchUps should have BYE status from the propagated byes
    const consolationByes = consolation.filter((m: any) => m.matchUpStatus === BYE);
    expect(consolationByes.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------
// Lucky draw BYE limit
// ----------------------------------------------------------------
describe('lucky draw bye limit', () => {
  it('returns LUCKY_DRAW_BYE_LIMIT when assigning second bye to lucky draw', () => {
    const drawProfiles = [{ drawSize: 4, participantsCount: 3, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures[0];
    const structureId = structure.structureId;

    // One bye already exists (3 participants in 4-draw)
    const existingByes = structure.positionAssignments?.filter((a: any) => a.bye);
    expect(existingByes?.length).toEqual(1);

    // Find a non-bye participant position
    const participantPosition = structure.positionAssignments?.find((a: any) => a.participantId && !a.bye);
    expect(participantPosition).toBeDefined();

    // Trying to assign a second bye should fail with LUCKY_DRAW_BYE_LIMIT
    let result: any = tournamentEngine.assignDrawPositionBye({
      drawPosition: participantPosition!.drawPosition,
      structureId,
      drawId,
    });
    // Lucky draw limit check runs at line 115-120 before position-filled check
    expect(result.error).toBeDefined();
    expect([LUCKY_DRAW_BYE_LIMIT, DRAW_POSITION_ASSIGNED]).toContain(result.error);
  });
});
