/**
 * Tests for seed withdrawal cascade — when a seeded player withdraws after
 * the draw is made, seeds from lower blocks cascade up to fill the vacancy.
 *
 * Seed blocks: [1], [2], [3,4], [5-8], [9-16], [17-32]
 */

import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, test, expect } from 'vitest';
import { SEED_CASCADE } from '@Constants/positionActionConstants';
import { ROUND_ROBIN, MAIN } from '@Constants/drawDefinitionConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';

/** Helper: get draw definition and main structure from a drawId */
function getDrawInfo(drawId: string) {
  let result: any = tournamentEngine.getEvent({ drawId });
  const { drawDefinition } = result;
  const structure = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);
  return { drawDefinition, structure, structureId: structure.structureId };
}

/** Helper: find the drawPosition for a given participantId */
function findDrawPosition(structure: any, participantId: string): number | undefined {
  return structure.positionAssignments?.find((a) => a.participantId === participantId)?.drawPosition;
}

/** Helper: find the seed assignment for a given seedNumber */
function findSeedByNumber(structure: any, seedNumber: number) {
  return structure.seedAssignments?.find((s) => s.seedNumber === seedNumber);
}

describe('seedWithdrawalCascade', () => {
  test('32-draw with 8 seeds: seed 3 withdraws, cascade 5→3, vacancy at 5', () => {
    const drawProfiles = [{ drawSize: 32, seedsCount: 8 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);

    const seed3 = findSeedByNumber(structure, 3);
    const seed5 = findSeedByNumber(structure, 5);
    expect(seed3?.participantId).toBeDefined();
    expect(seed5?.participantId).toBeDefined();

    const seed3Pid = seed3.participantId;
    const seed5Pid = seed5.participantId;
    const seed3DrawPos = findDrawPosition(structure, seed3Pid);
    const seed5DrawPos = findDrawPosition(structure, seed5Pid);

    let result: any = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId,
      drawPosition: seed3DrawPos,
    });
    expect(result.success).toBe(true);
    expect(result.vacatedDrawPosition).toBe(seed5DrawPos);

    const { structure: updated } = getDrawInfo(drawId);

    // Seed 5's participant moved to seed 3's draw position
    expect(updated.positionAssignments.find((a) => a.drawPosition === seed3DrawPos).participantId).toBe(seed5Pid);

    // Seed assignment 3 now holds seed 5's participant
    expect(findSeedByNumber(updated, 3).participantId).toBe(seed5Pid);

    // Seed assignment 5 cleared (end of cascade)
    expect(findSeedByNumber(updated, 5).participantId).toBeUndefined();

    // Withdrawn participant removed from all positions
    expect(updated.positionAssignments.find((a) => a.participantId === seed3Pid)).toBeUndefined();

    // Entry status set to WITHDRAWN
    result = tournamentEngine.getEvent({ drawId });
    const entry = result.drawDefinition.entries.find((e) => e.participantId === seed3Pid);
    expect(entry.entryStatus).toBe(WITHDRAWN);
  });

  test('64-draw with 16 seeds: seed 3 withdraws, 3-step cascade (5→3, 9→5)', () => {
    const drawProfiles = [{ drawSize: 64, seedsCount: 16 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);

    const seed3 = findSeedByNumber(structure, 3);
    const seed5 = findSeedByNumber(structure, 5);
    const seed9 = findSeedByNumber(structure, 9);
    expect(seed3?.participantId).toBeDefined();
    expect(seed5?.participantId).toBeDefined();
    expect(seed9?.participantId).toBeDefined();

    const seed3Pid = seed3.participantId;
    const seed5Pid = seed5.participantId;
    const seed9Pid = seed9.participantId;
    const seed3DrawPos = findDrawPosition(structure, seed3Pid);
    const seed5DrawPos = findDrawPosition(structure, seed5Pid);

    let result: any = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId,
      drawPosition: seed3DrawPos,
    });
    expect(result.success).toBe(true);

    const { structure: updated } = getDrawInfo(drawId);

    expect(updated.positionAssignments.find((a) => a.drawPosition === seed3DrawPos).participantId).toBe(seed5Pid);
    expect(updated.positionAssignments.find((a) => a.drawPosition === seed5DrawPos).participantId).toBe(seed9Pid);
    expect(findSeedByNumber(updated, 3).participantId).toBe(seed5Pid);
    expect(findSeedByNumber(updated, 5).participantId).toBe(seed9Pid);
    expect(findSeedByNumber(updated, 9).participantId).toBeUndefined();
  });

  test('16-draw with 4 seeds: seed 1 withdraws, cascade 2→1, 3→2, vacancy at 3', () => {
    // Blocks: [1], [2], [3,4]. Seed 1 withdraws → seed 2 moves to seed 1's
    // position → seed 3 moves to seed 2's position → vacancy at seed 3's position.
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);

    const seed1 = findSeedByNumber(structure, 1);
    const seed2 = findSeedByNumber(structure, 2);
    const seed3 = findSeedByNumber(structure, 3);
    const seed1Pid = seed1.participantId;
    const seed2Pid = seed2.participantId;
    const seed3Pid = seed3.participantId;
    const seed1DrawPos = findDrawPosition(structure, seed1Pid);

    let result: any = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId,
      drawPosition: seed1DrawPos,
    });
    expect(result.success).toBe(true);

    const { structure: updated } = getDrawInfo(drawId);

    // Seed 2's participant at seed 1's draw position
    expect(updated.positionAssignments.find((a) => a.drawPosition === seed1DrawPos).participantId).toBe(seed2Pid);
    // Seed assignments: slot 1 → seed2's pid, slot 2 → seed3's pid
    expect(findSeedByNumber(updated, 1).participantId).toBe(seed2Pid);
    expect(findSeedByNumber(updated, 2).participantId).toBe(seed3Pid);
    // Slot 3 cleared (end of cascade)
    expect(findSeedByNumber(updated, 3).participantId).toBeUndefined();
  });

  test('seed in lowest block: no cascade, just vacancy', () => {
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);
    const seed4 = findSeedByNumber(structure, 4);
    const seed4Pid = seed4.participantId;
    const seed4DrawPos = findDrawPosition(structure, seed4Pid);

    let result: any = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId,
      drawPosition: seed4DrawPos,
    });
    expect(result.success).toBe(true);
    expect(result.vacatedDrawPosition).toBe(seed4DrawPos);

    const { structure: updated } = getDrawInfo(drawId);
    expect(updated.positionAssignments.find((a) => a.drawPosition === seed4DrawPos).participantId).toBeUndefined();
    expect(findSeedByNumber(updated, 4).participantId).toBeUndefined();
  });

  test('no duplicate participantIds after cascade', () => {
    const drawProfiles = [{ drawSize: 32, seedsCount: 8 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);
    const seed1DrawPos = findDrawPosition(structure, findSeedByNumber(structure, 1).participantId);

    let result: any = tournamentEngine.seedWithdrawalCascade({ drawId, structureId, drawPosition: seed1DrawPos });
    expect(result.success).toBe(true);

    const { structure: updated } = getDrawInfo(drawId);
    const assignedIds = updated.positionAssignments.map((a) => a.participantId).filter(Boolean);
    expect(assignedIds.length).toBe(new Set(assignedIds).size);
  });

  test('error: non-seeded participant', () => {
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);
    const seededPids = new Set(structure.seedAssignments.filter((s) => s.participantId).map((s) => s.participantId));
    const unseededPos = structure.positionAssignments.find(
      (a) => a.participantId && !seededPids.has(a.participantId) && !a.bye,
    );

    let result: any = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId,
      drawPosition: unseededPos.drawPosition,
    });
    expect(result.error).toBeDefined();
  });

  test('error: round robin structure', () => {
    const drawProfiles = [{ drawSize: 8, drawType: ROUND_ROBIN }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    let result: any = tournamentEngine.getEvent({ drawId });
    const structure = result.drawDefinition.structures[0];

    result = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId: structure.structureId,
      drawPosition: 1,
    });
    expect(result.error).toBeDefined();
  });

  test('error: matchUps already in progress', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const readyMatchUp = matchUps.find((m) => m.readyToScore);
    if (readyMatchUp) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: readyMatchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId,
      });
    }

    const { structure, structureId } = getDrawInfo(drawId);
    const seed1 = findSeedByNumber(structure, 1);
    const seed1DrawPos = findDrawPosition(structure, seed1.participantId);

    let result: any = tournamentEngine.seedWithdrawalCascade({
      drawId,
      structureId,
      drawPosition: seed1DrawPos,
    });
    expect(result.error).toBeDefined();
  });
});

describe('SEED_CASCADE position action', () => {
  test('appears for seeded participant with lower seeds available', () => {
    const drawProfiles = [{ drawSize: 32, seedsCount: 8 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);
    const seed1 = findSeedByNumber(structure, 1);
    const seed1DrawPos = findDrawPosition(structure, seed1.participantId);

    let result: any = tournamentEngine.positionActions({ drawId, structureId, drawPosition: seed1DrawPos });
    expect(result.validActions).toBeDefined();
    const cascadeAction = result.validActions.find((a) => a.type === SEED_CASCADE);
    expect(cascadeAction).toBeDefined();
    expect(cascadeAction.method).toBe('seedWithdrawalCascade');
  });

  test('does not appear for unseeded participant', () => {
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);
    const seededPids = new Set(structure.seedAssignments.filter((s) => s.participantId).map((s) => s.participantId));
    const unseededPos = structure.positionAssignments.find(
      (a) => a.participantId && !seededPids.has(a.participantId) && !a.bye,
    );

    let result: any = tournamentEngine.positionActions({ drawId, structureId, drawPosition: unseededPos.drawPosition });
    const cascadeAction = result.validActions?.find((a) => a.type === SEED_CASCADE);
    expect(cascadeAction).toBeUndefined();
  });

  test('does not appear for seed in lowest block', () => {
    // 16-draw, 4 seeds: blocks [1],[2],[3,4]. Seed 3 is in the lowest block.
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles });

    const { structure, structureId } = getDrawInfo(drawId);
    const seed3 = findSeedByNumber(structure, 3);
    const seed3DrawPos = findDrawPosition(structure, seed3.participantId);

    let result: any = tournamentEngine.positionActions({ drawId, structureId, drawPosition: seed3DrawPos });
    const cascadeAction = result.validActions?.find((a) => a.type === SEED_CASCADE);
    expect(cascadeAction).toBeUndefined();
  });
});
