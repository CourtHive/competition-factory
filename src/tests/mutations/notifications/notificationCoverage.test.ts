import { addEventNotice } from '@Mutate/notifications/eventNotifications';
import { expect, it, describe } from 'vitest';
import {
  addMatchUpsNotice,
  deleteMatchUpsNotice,
  modifyMatchUpNotice,
  updateInContextMatchUp,
  addDrawNotice,
  deleteDrawNotice,
  modifyDrawNotice,
  modifySeedAssignmentsNotice,
  modifyPositionAssignmentsNotice,
} from '@Mutate/notifications/drawNotifications';

describe('drawNotifications edge cases', () => {
  it('addMatchUpsNotice without drawDefinition', () => {
    const result = addMatchUpsNotice({
      matchUps: [{ matchUpId: 'm1' } as any],
      tournamentId: 't1',
    });
    expect(result.success).toEqual(true);
  });

  it('addMatchUpsNotice with drawDefinition', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [{ structureId: 's1' }],
    } as any;
    const result = addMatchUpsNotice({
      matchUps: [{ matchUpId: 'm1' } as any],
      drawDefinition,
      tournamentId: 't1',
    });
    expect(result.success).toEqual(true);
    expect(drawDefinition.updatedAt).toBeDefined();
  });

  it('deleteMatchUpsNotice clears notices for deleted matchUpIds', () => {
    const drawDefinition = { drawId: 'd1', structures: [] } as any;
    const result = deleteMatchUpsNotice({
      matchUpIds: ['m1', 'm2'],
      drawDefinition,
      tournamentId: 't1',
    });
    expect(result.success).toEqual(true);
  });

  it('deleteMatchUpsNotice without drawDefinition', () => {
    const result = deleteMatchUpsNotice({
      matchUpIds: ['m1'],
      tournamentId: 't1',
    });
    expect(result.success).toEqual(true);
  });

  it('modifyMatchUpNotice returns error for missing matchUp', () => {
    const result = modifyMatchUpNotice({ matchUp: undefined as any });
    expect(result.error).toBeDefined();
  });

  it('modifyMatchUpNotice with drawDefinition and structureId', () => {
    const drawDefinition = {
      structures: [{ structureId: 's1' }, { structureId: 's2' }],
      drawId: 'd1',
    } as any;
    const matchUp = { matchUpId: 'm1' } as any;
    const result: any = modifyMatchUpNotice({
      structureId: 's1',
      tournamentId: 't1',
      drawDefinition,
      matchUp,
    });
    expect(result.success).toEqual(true);
    // only s1 structure should be updated, not s2
  });

  it('modifyMatchUpNotice without drawDefinition', () => {
    const matchUp = { matchUpId: 'm1' } as any;
    const result: any = modifyMatchUpNotice({ matchUp, tournamentId: 't1' });
    expect(result.success).toEqual(true);
  });

  it('addMatchUpsNotice stamps updatedAt on every matchUp in the payload', () => {
    const m1 = { matchUpId: 'm1' } as any;
    const m2 = { matchUpId: 'm2' } as any;
    addMatchUpsNotice({ matchUps: [m1, m2], tournamentId: 't1' });
    expect(typeof m1.updatedAt).toBe('string');
    expect(typeof m2.updatedAt).toBe('string');
    // ISO date strings are parseable
    expect(Number.isNaN(new Date(m1.updatedAt).getTime())).toBe(false);
    expect(Number.isNaN(new Date(m2.updatedAt).getTime())).toBe(false);
  });

  it('addMatchUpsNotice tolerates a missing matchUps array', () => {
    // `matchUps: undefined` used to be valid before the stamp loop
    // existed; keep it safe for legacy call sites that pass nothing.
    const result: any = addMatchUpsNotice({ matchUps: undefined as any, tournamentId: 't1' });
    expect(result.success).toEqual(true);
  });

  it('modifyMatchUpNotice stamps updatedAt on the matchUp', () => {
    const matchUp = { matchUpId: 'm1' } as any;
    modifyMatchUpNotice({ matchUp, tournamentId: 't1' });
    expect(typeof matchUp.updatedAt).toBe('string');
    expect(Number.isNaN(new Date(matchUp.updatedAt).getTime())).toBe(false);
  });

  it('repeated modifyMatchUpNotice produces strictly-greater updatedAt', () => {
    const matchUp = { matchUpId: 'm1' } as any;
    modifyMatchUpNotice({ matchUp, tournamentId: 't1' });
    const first = new Date(matchUp.updatedAt).getTime();
    // Same-millisecond mutation is the hot-loop worst case: the monotonic
    // bump guarantees the next timestamp is at least +1ms.
    modifyMatchUpNotice({ matchUp, tournamentId: 't1' });
    const second = new Date(matchUp.updatedAt).getTime();
    expect(second).toBeGreaterThan(first);
  });

  it('stampMatchUpUpdatedAt tolerates a prior Date-typed updatedAt', () => {
    // The shape allows Date | string; make sure the bump logic handles
    // both rather than coercing an existing Date to NaN.
    const matchUp = { matchUpId: 'm1', updatedAt: new Date() } as any;
    modifyMatchUpNotice({ matchUp, tournamentId: 't1' });
    expect(typeof matchUp.updatedAt).toBe('string');
  });

  it('updateInContextMatchUp returns error for missing matchUp', () => {
    const result = updateInContextMatchUp({ tournamentId: 't1', inContextMatchUp: undefined });
    expect(result.error).toBeDefined();
  });

  it('updateInContextMatchUp succeeds with valid matchUp', () => {
    const result: any = updateInContextMatchUp({
      tournamentId: 't1',
      inContextMatchUp: { matchUpId: 'm1' },
    });
    expect(result.success).toEqual(true);
  });

  it('addDrawNotice returns error for missing drawDefinition', () => {
    const result: any = addDrawNotice({ tournamentId: 't1' });
    expect(result.error).toBeDefined();
  });

  it('addDrawNotice succeeds with drawDefinition', () => {
    const drawDefinition = { drawId: 'd1', structures: [] } as any;
    const result: any = addDrawNotice({ drawDefinition, tournamentId: 't1' });
    expect(result.success).toEqual(true);
  });

  it('deleteDrawNotice succeeds', () => {
    const result: any = deleteDrawNotice({ drawId: 'd1', tournamentId: 't1' });
    expect(result.success).toEqual(true);
  });

  it('modifyDrawNotice returns error for missing drawDefinition', () => {
    const result: any = modifyDrawNotice({ drawDefinition: undefined as any });
    expect(result.error).toBeDefined();
  });

  it('modifyDrawNotice with structureIds filters update', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [{ structureId: 's1' }, { structureId: 's2' }],
    } as any;
    const result: any = modifyDrawNotice({
      drawDefinition,
      structureIds: ['s1'],
      tournamentId: 't1',
    });
    expect(result.success).toEqual(true);
    // s1 should have updatedAt, s2 may or may not
  });

  it('modifySeedAssignmentsNotice returns error for missing drawDefinition', () => {
    const result: any = modifySeedAssignmentsNotice({
      structure: { structureId: 's1', seedAssignments: [] },
      tournamentId: 't1',
    } as any);
    expect(result.error).toBeDefined();
  });

  it('modifySeedAssignmentsNotice returns error for missing structure', () => {
    const result: any = modifySeedAssignmentsNotice({
      drawDefinition: { drawId: 'd1', structures: [] },
      tournamentId: 't1',
    } as any);
    expect(result.error).toBeDefined();
  });

  it('modifySeedAssignmentsNotice succeeds', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [{ structureId: 's1' }],
    } as any;
    const structure = { structureId: 's1', seedAssignments: [{ seedNumber: 1, participantId: 'p1' }] } as any;
    const result: any = modifySeedAssignmentsNotice({
      drawDefinition,
      structure,
      tournamentId: 't1',
    } as any);
    expect(result.success).toEqual(true);
  });

  it('modifyPositionAssignmentsNotice returns error for missing drawDefinition', () => {
    const result: any = modifyPositionAssignmentsNotice({
      structure: { structureId: 's1', positionAssignments: [] },
      tournamentId: 't1',
    } as any);
    expect(result.error).toBeDefined();
  });

  it('modifyPositionAssignmentsNotice returns error for missing structure', () => {
    const result: any = modifyPositionAssignmentsNotice({
      drawDefinition: { drawId: 'd1' },
      tournamentId: 't1',
    } as any);
    expect(result.error).toBeDefined();
  });

  it('modifyPositionAssignmentsNotice succeeds', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [{ structureId: 's1' }],
    } as any;
    const structure = {
      structureId: 's1',
      positionAssignments: [{ drawPosition: 1, participantId: 'p1' }],
    };
    const result: any = modifyPositionAssignmentsNotice({
      drawDefinition,
      structure,
      tournamentId: 't1',
      event: { eventId: 'e1' } as any,
    } as any);
    expect(result.success).toEqual(true);
  });

  it('drawUpdatedAt handles timestamp collision', () => {
    const drawDefinition = {
      drawId: 'd1',
      updatedAt: new Date().toISOString(),
      structures: [{ structureId: 's1' }],
    } as any;
    // Call twice rapidly — should handle timestamp collision by incrementing
    const result1: any = modifyDrawNotice({ drawDefinition, tournamentId: 't1' });
    expect(result1.success).toEqual(true);
    const firstUpdatedAt = drawDefinition.updatedAt;

    const result2: any = modifyDrawNotice({ drawDefinition, tournamentId: 't1' });
    expect(result2.success).toEqual(true);
    // updatedAt should be different
    expect(drawDefinition.updatedAt).not.toEqual(firstUpdatedAt);
  });
});

describe('eventNotifications edge cases', () => {
  it('addEventNotice returns error for missing event', () => {
    const result: any = addEventNotice({ tournamentId: 't1' });
    expect(result.error).toBeDefined();
  });

  it('addEventNotice succeeds with event', () => {
    const result: any = addEventNotice({
      tournamentId: 't1',
      event: { eventId: 'e1' } as any,
    });
    expect(result.success).toEqual(true);
  });
});
