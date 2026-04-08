import { getCompetitionFormat } from '@Query/hierarchical/getCompetitionFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { MISSING_DRAW_ID } from '@Constants/errorConditionConstants';
import { competitionFormat } from '@Types/competitionFormat';

// Fixtures
import INTENNSE_STANDARD from '@Fixtures/scoring/competitionFormats/INTENNSE_STANDARD.json';
import TENNIS_STANDARD from '@Fixtures/scoring/competitionFormats/TENNIS_STANDARD.json';

describe('getCompetitionFormat', () => {
  it('resolves competitionFormat from event level', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    event.competitionFormat = INTENNSE_STANDARD as competitionFormat;

    const result = getCompetitionFormat({
      tournamentRecord,
      event,
    });

    expect(result.success).toBe(true);
    expect(result.eventDefaultCompetitionFormat).toEqual(INTENNSE_STANDARD);
    expect(result.competitionFormat).toEqual(INTENNSE_STANDARD);
    expect(result.competitionFormat?.pointMultipliers).toHaveLength(2);
  });

  it('resolves competitionFormat from drawDefinition level', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions![0];
    drawDefinition.competitionFormat = INTENNSE_STANDARD as competitionFormat;

    const structureId = drawDefinition.structures![0].structureId;

    const result = getCompetitionFormat({
      tournamentRecord,
      drawDefinition,
      structureId,
      event,
    });

    expect(result.drawDefaultCompetitionFormat).toEqual(INTENNSE_STANDARD);
    expect(result.competitionFormat).toEqual(INTENNSE_STANDARD);
  });

  it('draw-level overrides event-level competitionFormat', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions![0];
    const structureId = drawDefinition.structures![0].structureId;

    event.competitionFormat = TENNIS_STANDARD as competitionFormat;
    drawDefinition.competitionFormat = INTENNSE_STANDARD as competitionFormat;

    const result = getCompetitionFormat({
      tournamentRecord,
      drawDefinition,
      structureId,
      event,
    });

    expect(result.eventDefaultCompetitionFormat).toEqual(TENNIS_STANDARD);
    expect(result.drawDefaultCompetitionFormat).toEqual(INTENNSE_STANDARD);
    // Draw overrides event
    expect(result.competitionFormat).toEqual(INTENNSE_STANDARD);
  });

  it('structure-level overrides draw and event competitionFormat', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions![0];
    const structure = drawDefinition.structures![0];

    const structureFormat: competitionFormat = {
      ...INTENNSE_STANDARD,
      competitionFormatName: 'STRUCTURE_OVERRIDE',
    } as competitionFormat;

    event.competitionFormat = TENNIS_STANDARD as competitionFormat;
    drawDefinition.competitionFormat = TENNIS_STANDARD as competitionFormat;
    structure.competitionFormat = structureFormat;

    const result = getCompetitionFormat({
      tournamentRecord,
      drawDefinition,
      structureId: structure.structureId,
      event,
    });

    expect(result.structureDefaultCompetitionFormat?.competitionFormatName).toBe('STRUCTURE_OVERRIDE');
    expect(result.competitionFormat?.competitionFormatName).toBe('STRUCTURE_OVERRIDE');
  });

  it('works through the tournament engine with drawId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    event.competitionFormat = INTENNSE_STANDARD as competitionFormat;

    tournamentEngine.setState(tournamentRecord);

    const drawId = event.drawDefinitions![0].drawId;
    const result = tournamentEngine.getCompetitionFormat({ drawId });

    expect(result.success).toBe(true);
    expect(result.eventDefaultCompetitionFormat).toEqual(INTENNSE_STANDARD);
    expect(result.competitionFormat).toEqual(INTENNSE_STANDARD);
  });

  it('works through the tournament engine with matchUpId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions![0];
    drawDefinition.competitionFormat = INTENNSE_STANDARD as competitionFormat;

    tournamentEngine.setState(tournamentRecord);

    const matchUpId = drawDefinition.structures![0].matchUps![0].matchUpId;
    const result = tournamentEngine.getCompetitionFormat({ matchUpId });

    expect(result.success).toBe(true);
    expect(result.drawDefaultCompetitionFormat).toEqual(INTENNSE_STANDARD);
    expect(result.competitionFormat).toEqual(INTENNSE_STANDARD);
  });

  it('returns error when no identifying parameters provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getCompetitionFormat({
      tournamentRecord,
    });

    expect(result.error).toBeDefined();
  });

  it('returns error when tournamentRecord is missing', () => {
    const result = getCompetitionFormat({
      tournamentRecord: null as any,
    });

    expect(result.error).toBeDefined();
  });

  it('returns error when structureId provided without drawDefinition', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const structureId = tournamentRecord.events[0].drawDefinitions![0].structures![0].structureId;

    const result = getCompetitionFormat({
      tournamentRecord,
      structureId,
    });

    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('handles invalid matchUpId gracefully', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getCompetitionFormat({
      tournamentRecord,
      matchUpId: 'nonexistent',
    });

    // Returns a result without error - matchUp resolution is best-effort
    expect(result).toBeDefined();
    expect(result.competitionFormat).toBeUndefined();
  });

  it('returns undefined competitionFormat when none set at any level', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getCompetitionFormat({
      tournamentRecord,
      event: tournamentRecord.events[0],
    });

    expect(result.success).toBe(true);
    expect(result.competitionFormat).toBeUndefined();
  });

  it('resolves drawDefinition from matchUpResult when not provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions![0];
    drawDefinition.competitionFormat = INTENNSE_STANDARD as competitionFormat;

    const matchUpId = drawDefinition.structures![0].matchUps![0].matchUpId;

    const result = getCompetitionFormat({
      tournamentRecord,
      matchUpId,
      // Not providing drawDefinition - should resolve internally
    });

    expect(result.drawDefaultCompetitionFormat).toEqual(INTENNSE_STANDARD);
    expect(result.competitionFormat).toEqual(INTENNSE_STANDARD);
  });

  it('returns error when invalid structureId with drawDefinition', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions![0];

    const result = getCompetitionFormat({
      tournamentRecord,
      structureId: 'nonexistent',
      drawDefinition,
    });

    expect(result.error).toBeDefined();
  });
});
