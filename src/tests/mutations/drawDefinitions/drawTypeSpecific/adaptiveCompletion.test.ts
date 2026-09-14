/**
 * Test adaptive draw completion and resetDrawDefinition.
 * Generates an adaptive draw of drawSize 14, completes all matchUps
 * across all structures using lucky draw round resolution, then verifies
 * resetDrawDefinition clears all position assignments.
 */
import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ADAPTIVE } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

const DRAW_SIZE = 14;

function attemptLuckyAdvancement(drawId: string, structures: any[]): boolean {
  for (const structure of structures) {
    const luckyStatus = tournamentEngine.getLuckyDrawRoundStatus({
      structureId: structure.structureId,
      drawId,
    });

    if (!luckyStatus?.isLuckyDraw) continue;

    for (const round of luckyStatus.rounds || []) {
      if (round.needsLuckySelection && round.eligibleLosers?.length) {
        let result: any = tournamentEngine.luckyDrawAdvancement({
          participantId: round.eligibleLosers[0].participantId,
          structureId: structure.structureId,
          roundNumber: round.roundNumber,
          drawId,
        });
        if (result.success) return true;
      }
    }
  }
  return false;
}

function completeReadyMatchUps(readyMatchUps: any[], drawId: string): number {
  let completed = 0;
  for (const matchUp of readyMatchUps) {
    const matchUpFormat = matchUp.matchUpFormat || 'SET3-S:6/TB7';
    const { outcome } = generateOutcomeFromScoreString({
      matchUpStatus: COMPLETED,
      scoreString: '6-1 6-1',
      winningSide: 1,
      matchUpFormat,
    });
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    if (result.success) {
      completed++;
    } else {
      console.log('setMatchUpStatus error:', result.error, matchUp.matchUpId);
      break;
    }
  }
  return completed;
}

function verifyStructureCompletion(allMatchUps: any[], structures: any[]) {
  for (const structure of structures) {
    const structureMatchUps = allMatchUps.filter((m: any) => m.structureId === structure.structureId);
    if (structureMatchUps.length === 0) continue;

    const hasWinner = structureMatchUps.some((m: any) => m.winningSide);
    if (structureMatchUps.length > 0) {
      console.log(
        `${structure.structureName}: ${structureMatchUps.length} matchUps, ` +
          `${structureMatchUps.filter((m: any) => m.winningSide).length} completed`,
      );
    }
    expect(hasWinner).toBe(true);
  }
}

function verifyResetState(resetDD: any) {
  for (const structure of resetDD.structures) {
    const assignments = structure.positionAssignments || [];
    const isMainFirst = structure.stage === 'MAIN' && structure.stageSequence === 1;

    if (isMainFirst) {
      const r1Positions = new Set(
        (structure.matchUps || [])
          .filter((m) => m.roundNumber === 1)
          .flatMap((m) => m.drawPositions || [])
          .filter(Boolean),
      );
      for (const a of assignments) {
        expect(r1Positions.has(a.drawPosition)).toBe(true);
      }
      const scoredR1 = (structure.matchUps || []).filter((m) => m.roundNumber === 1 && m.winningSide);
      expect(scoredR1.length).toBe(0);
    } else {
      const hasParticipants = assignments.some((a) => a.participantId);
      expect(hasParticipants).toBe(false);
      expect(assignments.length).toBe(0);
    }

    for (const child of structure.structures || []) {
      const childAssignments = child.positionAssignments || [];
      const childHasParticipants = childAssignments.some((a) => a.participantId);
      expect(childHasParticipants).toBe(false);
    }
  }
}

describe('Adaptive draw completion and reset', () => {
  it('completes all structures and resets draw positions', () => {
    const drawId = 'adaptive-draw';

    mocksEngine.generateTournamentRecord({
      participantsProfile: { idPrefix: 'P', participantsCount: DRAW_SIZE },
      eventProfiles: [
        {
          drawProfiles: [{ drawId, drawSize: DRAW_SIZE, drawType: ADAPTIVE }],
        },
      ],
      setState: true,
    });

    // Get all structures
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structures = drawDefinition.structures;
    expect(structures.length).toBeGreaterThan(1);

    const structureNames = structures.map((s) => s.structureName);
    console.log('structures:', structureNames);

    // Check East structure has participants positioned
    const eastStructure = structures.find((s) => s.structureName === 'East');
    const eastAssignments = eastStructure?.positionAssignments?.filter((a) => a.participantId);
    console.log('East positioned:', eastAssignments?.length, 'of', eastStructure?.positionAssignments?.length);

    // Check initial matchUp state
    const { matchUps: initialMatchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const readyInitial = initialMatchUps.filter((m: any) => m.readyToScore && !m.winningSide);
    console.log('initially ready:', readyInitial.length, 'total:', initialMatchUps.length);

    // Complete all matchUps across all structures, handling lucky advancement
    let maxIterations = 100; // safety
    let totalCompleted = 0;

    while (maxIterations-- > 0) {
      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      const readyMatchUps = matchUps.filter((m: any) => m.readyToScore && !m.winningSide && m.matchUpStatus !== 'BYE');
      if (readyMatchUps.length)
        console.log(
          'ready:',
          readyMatchUps.length,
          'round:',
          readyMatchUps[0].roundNumber,
          'structure:',
          readyMatchUps[0].structureName,
        );
      if (!readyMatchUps.length) {
        if (!attemptLuckyAdvancement(drawId, structures)) break;
        continue;
      }

      totalCompleted += completeReadyMatchUps(readyMatchUps, drawId);
    }

    console.log('total completed:', totalCompleted);
    expect(totalCompleted).toBeGreaterThan(0);

    // Verify all structures have been played
    const { matchUps: allMatchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const completedMatchUps = allMatchUps.filter((m: any) => m.winningSide || m.matchUpStatus === 'BYE');
    const incompleteMatchUps = allMatchUps.filter((m: any) => !m.winningSide && m.matchUpStatus !== 'BYE');

    console.log('completed:', completedMatchUps.length, 'incomplete:', incompleteMatchUps.length);

    verifyStructureCompletion(allMatchUps, structures);

    // All matchUps should be complete (no incomplete non-BYE matchUps)
    expect(incompleteMatchUps.length).toBe(0);

    // ── Reset draw definition ──
    let result: any = tournamentEngine.resetDrawDefinition({ drawId });
    expect(result.success).toBe(true);

    // Verify reset state across all structures
    const { drawDefinition: resetDD } = tournamentEngine.getEvent({ drawId });
    verifyResetState(resetDD);

    // ── Reset with removeAssignments clears everything ──
    result = tournamentEngine.resetDrawDefinition({ drawId, removeAssignments: true });
    expect(result.success).toBe(true);

    const { drawDefinition: fullResetDD } = tournamentEngine.getEvent({ drawId });
    for (const structure of fullResetDD.structures) {
      const assignments = structure.positionAssignments || [];
      const hasParticipants = assignments.some((a) => a.participantId);
      expect(hasParticipants).toBe(false);
    }
  });
});
