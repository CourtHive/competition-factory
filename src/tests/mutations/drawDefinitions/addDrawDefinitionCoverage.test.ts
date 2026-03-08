import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DRAW_ID_EXISTS, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

describe('addDrawDefinition coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      setState: true,
    });
    const { events } = tournamentEngine.getEvents();
    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: undefined as any,
      eventId: events[0].eventId,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns DRAW_ID_EXISTS when adding duplicate without allowReplacement', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
    });
    expect(result.error).toEqual(DRAW_ID_EXISTS);
  });

  it('allows replacement with allowReplacement flag', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
      allowReplacement: true,
    });
    expect(result.success).toBe(true);
  });

  it('respects existingDrawCount mismatch', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const newDraw = newDrawDefinition({ drawId: 'new-draw-id' });

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDraw,
      eventId: event.eventId,
      existingDrawCount: 999, // doesn't match
    });
    expect(result.error).toBeDefined();
  });

  it('can add a new draw definition with modifyEventEntries', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const newDraw: DrawDefinition = newDrawDefinition({ drawId: 'brand-new-draw' });
    newDraw.entries = [];

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDraw,
      eventId: event.eventId,
      modifyEventEntries: true,
    });
    expect(result.success).toBe(true);
  });
});
