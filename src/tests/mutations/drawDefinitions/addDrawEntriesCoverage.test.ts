import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { setStageDrawSize } from '@Mutate/drawDefinitions/entryGovernor/stageEntryCounts';
import { addDrawEntries } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { describe, expect, it } from 'vitest';

// constants and types
import { MAIN, VOLUNTARY_CONSOLATION, AD_HOC } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE, LUCKY_LOSER } from '@Constants/entryStatusConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_STAGE,
  PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE,
  DUPLICATE_ENTRY,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

describe('addDrawEntries coverage', () => {
  it('returns error when participantIds is not an array', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: 'notAnArray' as any,
      stage: MAIN,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  });

  it('handles VOLUNTARY_CONSOLATION stage duplicate detection', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    setStageDrawSize({ drawDefinition, stage: VOLUNTARY_CONSOLATION, drawSize: 8 });

    // First add to VC stage
    addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: VOLUNTARY_CONSOLATION,
    });
    // Try adding same participant to VC stage again
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: VOLUNTARY_CONSOLATION,
    });
    expect(result.success).toBe(true);
    // Should have been caught as invalidVoluntaryConsolation
    expect(result.participantIdsNotAdded).toBeDefined();
  });

  it('returns error when stage is invalid', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: 'INVALID_STAGE' as any,
    });
    expect(result.error).toEqual(INVALID_STAGE);
  });

  it('returns error when participant count exceeds draw size', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 2 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1', 'p2', 'p3'],
      stage: MAIN,
    });
    expect(result.error).toEqual(PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE);
  });

  it('adds entries successfully', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1', 'p2'],
      stage: MAIN,
    });
    expect(result.success).toBe(true);
    expect(drawDefinition.entries?.length).toBe(2);
  });

  it('handles duplicate entries with suppressDuplicateEntries=true', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
    });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      suppressDuplicateEntries: true,
    });
    expect(result.success).toBe(true);
    // p1 was already added, should not be duplicated
  });

  it('returns DUPLICATE_ENTRY error when suppressDuplicateEntries=false', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
    });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      suppressDuplicateEntries: false,
    });
    expect(result.error).toEqual(DUPLICATE_ENTRY);
  });

  it('handles LUCKY_LOSER duplicate entries correctly', () => {
    const drawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    // Add as direct acceptance first
    addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      entryStatus: DIRECT_ACCEPTANCE,
    });
    // Add as lucky loser - should get added separately
    addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      entryStatus: LUCKY_LOSER,
    });
    // Try adding same lucky loser again - should be caught
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      entryStatus: LUCKY_LOSER,
    });
    expect(result.success).toBe(true);
    expect(result.participantIdsNotAdded).toBeDefined();
  });

  it('adds entries with extensions and roundTarget', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      roundTarget: 2,
      extension: { name: 'testExt', value: 'testVal' },
    });
    expect(result.success).toBe(true);
    const entry = drawDefinition.entries?.find((e) => e.participantId === 'p1');
    expect(entry).toBeDefined();
    expect(entry?.extensions).toBeDefined();
  });

  it('returns error for invalid extension', () => {
    const drawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    const result = addDrawEntries({
      drawDefinition,
      participantIds: ['p1'],
      stage: MAIN,
      extension: { invalid: true } as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('skips ignoreStageSpace when true', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 2 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1', 'p2', 'p3'],
      stage: MAIN,
      ignoreStageSpace: true,
    });
    expect(result.success).toBe(true);
    expect(drawDefinition.entries?.length).toBe(3);
  });

  it('allows adding entries for AD_HOC draws without stage validation', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    drawDefinition.drawType = AD_HOC;
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1', 'p2'],
      stage: MAIN,
    });
    expect(result.success).toBe(true);
  });

  it('handles autoEntryPositions=false', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'test' });
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 8 });
    const result: any = addDrawEntries({
      drawDefinition,
      participantIds: ['p1', 'p2'],
      stage: MAIN,
      autoEntryPositions: false,
    });
    expect(result.success).toBe(true);
  });
});
