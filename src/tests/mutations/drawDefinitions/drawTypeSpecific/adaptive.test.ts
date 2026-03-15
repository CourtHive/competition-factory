import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { setStageDrawSize } from '@Mutate/drawDefinitions/entryGovernor/stageEntryCounts';
import { addDrawEntries } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import { getDrawStructures } from '@Acquire/findStructure';
import { describe, expect, it, test } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { generateRange } from '@Tools/arrays';

// constants and types
import { ADAPTIVE, MAIN, PLAY_OFF, LOSER } from '@Constants/drawDefinitionConstants';
import { INVALID_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

// ──────────────────────────────────────────────────────────────────────────────
// Structure Generation
// ──────────────────────────────────────────────────────────────────────────────

describe('ADAPTIVE draw structure generation', () => {
  it('generates correct structures for drawSize 11', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 11 });
    generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });

    const stages = [MAIN, PLAY_OFF];
    const { structures } = getDrawStructures({ drawDefinition, stages });

    // Should have multiple structures (East + playoff directions)
    expect(structures.length).toBeGreaterThan(1);

    // Root structure should be East and MAIN stage
    const east = structures.find((s) => s.structureName === 'East');
    expect(east).toBeDefined();
    expect(east?.stage).toEqual(MAIN);

    // All non-root structures should be PLAY_OFF
    const secondaries = structures.filter((s) => s.structureName !== 'East');
    secondaries.forEach((s) => {
      expect(s.stage).toEqual(PLAY_OFF);
    });

    // Should have LOSER links
    expect(drawDefinition.links?.length).toBeGreaterThan(0);
    drawDefinition.links?.forEach((link) => {
      expect(link.linkType).toEqual(LOSER);
    });
  });

  it('generates correct structures for drawSize 16 (power-of-2)', () => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 16 });
    generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });

    const stages = [MAIN, PLAY_OFF];
    const { structures } = getDrawStructures({ drawDefinition, stages });

    // Power-of-2 should generate compass-like topology
    expect(structures.length).toBeGreaterThan(1);

    const east = structures.find((s) => s.structureName === 'East');
    expect(east).toBeDefined();

    // Should have standard compass direction names
    const structureNames = structures.map((s) => s.structureName);
    expect(structureNames).toContain('East');
    expect(structureNames).toContain('West');
  });

  it('generates correct structures for drawSize 8', () => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });

    const stages = [MAIN, PLAY_OFF];
    const { structures } = getDrawStructures({ drawDefinition, stages });

    // drawSize 8, roundOffsetLimit 3 → up to 8 compass directions
    expect(structures.length).toBeGreaterThan(1);

    const structureNames = structures.map((s) => s.structureName);
    expect(structureNames).toContain('East');
    expect(structureNames).toContain('West');
    expect(structureNames).toContain('North');
  });

  it('respects configurable depth via roundOffsetLimit', () => {
    // roundOffsetLimit: 1 → only 2 structures (East + West)
    const drawProfiles = [{ drawSize: 16, drawType: ADAPTIVE, roundOffsetLimit: 1 }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({
      drawId: tournamentRecord.events[0].drawDefinitions[0].drawId,
    });

    const stages = [MAIN, PLAY_OFF];
    const { structures } = getDrawStructures({ drawDefinition, stages });

    // With roundOffsetLimit 1, should have East (root) + West (R1 losers) only
    expect(structures.length).toEqual(2);
    const structureNames = structures.map((s) => s.structureName);
    expect(structureNames).toContain('East');
    expect(structureNames).toContain('West');
  });

  it('suppresses structures with fewer than 2 participants', () => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 5 });
    generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });

    const stages = [MAIN, PLAY_OFF];
    const { structures } = getDrawStructures({ drawDefinition, stages });

    // All structures should have at least 2 draw positions
    structures.forEach((s) => {
      const positionCount = s.positionAssignments?.length ?? 0;
      expect(positionCount).toBeGreaterThanOrEqual(2);
    });
  });

  it('applies custom playoffAttributes naming', () => {
    const customAttributes = {
      0: { name: 'Main', abbreviation: 'M' },
      '0-1': { name: 'Consolation', abbreviation: 'C' },
      '0-2': { name: 'Plate', abbreviation: 'P' },
    };

    const drawProfiles = [{ drawSize: 8, drawType: ADAPTIVE, playoffAttributes: customAttributes }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({
      drawId: tournamentRecord.events[0].drawDefinitions[0].drawId,
    });

    const stages = [MAIN, PLAY_OFF];
    const { structures } = getDrawStructures({ drawDefinition, stages });

    const structureNames = structures.map((s) => s.structureName);
    expect(structureNames).toContain('Main');
    expect(structureNames).toContain('Consolation');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Draw Size Validation
// ──────────────────────────────────────────────────────────────────────────────

describe('ADAPTIVE draw size validation', () => {
  test('rejects drawSize 3 (non-power-of-2 < 5)', () => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 3 });
    const result = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });
    expect(result.error).toEqual(INVALID_DRAW_SIZE);
  });

  test('accepts drawSize 4 (power-of-2)', () => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 4 });
    const result = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });
    expect(result.error).toBeUndefined();
  });

  test('accepts drawSize 5 (non-power-of-2 >= 5)', () => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 5 });
    const result = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });
    expect(result.error).toBeUndefined();
  });

  test.each([7, 11, 13, 16, 32])('accepts drawSize %i', (drawSize) => {
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize });
    const result = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });
    expect(result.error).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Positioning
// ──────────────────────────────────────────────────────────────────────────────

describe('ADAPTIVE draw positioning', () => {
  it('can position participants in drawSize 11', () => {
    const stage = MAIN;
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage, drawSize: 11 });
    generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });

    const {
      structures: [structure],
    } = getDrawStructures({ drawDefinition, stage, stageSequence: 1 });
    const { structureId } = structure;

    const participants = generateRange(0, 11).map((i) => ({
      participantId: `adaptive-uuid${i + 1}`,
    }));
    const participantIds = participants.map((p) => p.participantId);

    addDrawEntries({ drawDefinition, stage, participantIds });
    const result = automatedPositioning({ drawDefinition, structureId });

    // Should succeed without errors
    expect(result?.error).toBeUndefined();

    // All participants should be positioned
    const assignments = structure.positionAssignments?.filter((a) => a.participantId);
    expect(assignments?.length).toEqual(11);
  });

  it('can position participants with BYE in drawSize 7', () => {
    const stage = MAIN;
    const drawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage, drawSize: 8 });
    generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawType: ADAPTIVE });

    const {
      structures: [structure],
    } = getDrawStructures({ drawDefinition, stage, stageSequence: 1 });
    const { structureId } = structure;

    // 7 participants in a drawSize 8 → 1 BYE
    const participants = generateRange(0, 7).map((i) => ({
      participantId: `adaptive-uuid${i + 1}`,
    }));
    const participantIds = participants.map((p) => p.participantId);

    addDrawEntries({ drawDefinition, stage, participantIds });
    const result = automatedPositioning({ drawDefinition, structureId });

    expect(result?.error).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tournament Engine Integration
// ──────────────────────────────────────────────────────────────────────────────

describe('ADAPTIVE via tournamentEngine', () => {
  test.each([5, 7, 8, 11, 16])('generates ADAPTIVE draw for drawSize %i', (drawSize) => {
    const drawProfiles = [{ drawSize, drawType: ADAPTIVE }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toBeGreaterThan(0);
  });
});
