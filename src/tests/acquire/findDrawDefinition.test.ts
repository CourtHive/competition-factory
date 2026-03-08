import { findDrawDefinition, publicFindDrawDefinition } from '@Acquire/findDrawDefinition';
import { beforeEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';

// types and constants
import { Tournament } from '@Types/tournamentTypes';
import {
  DRAW_DEFINITION_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_TOURNAMENT_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

describe('findDrawDefinition', () => {
  it('returns MISSING_TOURNAMENT_RECORD when neither tournamentRecord nor tournamentRecords provided', () => {
    const result = findDrawDefinition({ drawId: 'some-draw-id' } as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns MISSING_DRAW_ID when drawId is not provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = findDrawDefinition({ tournamentRecord, drawId: '' } as any);
    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('returns MISSING_DRAW_ID when drawId is undefined', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = findDrawDefinition({ tournamentRecord, drawId: undefined } as any);
    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('finds drawDefinition from tournamentRecord directly', () => {
    const drawProfiles = [{ drawSize: 8 }];
    const eventProfiles = [{ eventName: 'Test Event', drawProfiles }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ eventProfiles });

    const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
    expect(drawId).toBeDefined();

    const result = findDrawDefinition({ tournamentRecord, drawId: drawId! });
    expect(result.error).toBeUndefined();
    expect(result.drawDefinition).toBeDefined();
    expect(result.drawDefinition?.drawId).toEqual(drawId);
    expect(result.event).toBeDefined();
    expect(result.tournamentRecord).toBe(tournamentRecord);
  });

  it('returns DRAW_DEFINITION_NOT_FOUND when drawId does not match any draw', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = findDrawDefinition({ tournamentRecord, drawId: 'non-existent-draw-id' });
    expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);
  });

  describe('with tournamentRecords (multi-tournament)', () => {
    let tournamentRecords: { [key: string]: Tournament };
    let drawId: string;
    let tournamentId: string;

    beforeEach(() => {
      const drawProfiles = [{ drawSize: 8 }];
      const eventProfiles = [{ eventName: 'Test Event', drawProfiles }];
      const { tournamentRecord: record1 } = mocksEngine.generateTournamentRecord({ eventProfiles });
      const { tournamentRecord: record2 } = mocksEngine.generateTournamentRecord();

      tournamentId = record1.tournamentId;
      drawId = record1.events?.[0]?.drawDefinitions?.[0]?.drawId;

      tournamentRecords = {
        [record1.tournamentId]: record1,
        [record2.tournamentId]: record2,
      };
    });

    it('finds draw when tournamentId is provided as string', () => {
      const result = findDrawDefinition({ tournamentRecords, tournamentId, drawId });
      expect(result.error).toBeUndefined();
      expect(result.drawDefinition?.drawId).toEqual(drawId);
      expect(result.event).toBeDefined();
      expect(result.tournamentRecord?.tournamentId).toEqual(tournamentId);
    });

    it('finds draw by brute force when tournamentId is not provided', () => {
      const result = findDrawDefinition({ tournamentRecords, drawId });
      expect(result.error).toBeUndefined();
      expect(result.drawDefinition?.drawId).toEqual(drawId);
      expect(result.tournamentRecord?.tournamentId).toEqual(tournamentId);
    });

    it('returns MISSING_TOURNAMENT_ID when brute force search fails (drawId not found in any record)', () => {
      const result = findDrawDefinition({ tournamentRecords, drawId: 'completely-bogus-id' });
      expect(result.error).toEqual(MISSING_TOURNAMENT_ID);
    });

    it('returns MISSING_TOURNAMENT_RECORD when tournamentId points to non-existent record', () => {
      const result = findDrawDefinition({
        tournamentRecords,
        tournamentId: 'non-existent-tournament-id',
        drawId,
      });
      expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    });

    it('handles tournamentId as non-string type (triggers brute force)', () => {
      // When tournamentId is provided but not a string, it should brute force search
      const result = findDrawDefinition({
        tournamentRecords,
        tournamentId: 123 as any,
        drawId,
      });
      // Should find via brute force
      expect(result.error).toBeUndefined();
      expect(result.drawDefinition?.drawId).toEqual(drawId);
    });

    it('returns DRAW_DEFINITION_NOT_FOUND when tournamentId is valid but drawId is wrong', () => {
      const result = findDrawDefinition({
        tournamentRecords,
        tournamentId,
        drawId: 'wrong-draw-id',
      });
      expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);
    });
  });

  describe('publicFindDrawDefinition', () => {
    it('returns error when draw is not found', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      const result = publicFindDrawDefinition({ tournamentRecord, drawId: 'missing-draw' });
      expect(result.error).toBeDefined();
      expect(result.drawDefinition).toBeUndefined();
    });

    it('returns a deep copy of the drawDefinition', () => {
      const drawProfiles = [{ drawSize: 8 }];
      const eventProfiles = [{ eventName: 'Test Event', drawProfiles }];
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({ eventProfiles });

      const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
      const result = publicFindDrawDefinition({ tournamentRecord, drawId });

      expect(result.error).toBeUndefined();
      expect(result.drawDefinition).toBeDefined();
      expect(result.drawDefinition?.drawId).toEqual(drawId);

      // Verify it's a deep copy (not the same reference)
      const original = tournamentRecord.events?.[0]?.drawDefinitions?.[0];
      expect(result.drawDefinition).not.toBe(original);
    });
  });

  it('returns MISSING_TOURNAMENT_RECORD when tournamentRecord is explicitly undefined with no tournamentRecords', () => {
    const result = findDrawDefinition({
      tournamentRecord: undefined,
      tournamentRecords: undefined,
      drawId: 'some-id',
    } as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('handles tournamentRecord with no events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    // Remove events to ensure findEvent returns no drawDefinition
    tournamentRecord.events = [];
    const result = findDrawDefinition({ tournamentRecord, drawId: 'any-draw-id' });
    expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);
  });

  it('handles tournamentRecord with events but no drawDefinitions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventName: 'No Draws Event' }],
    });
    // Event exists but has no drawDefinitions
    const result = findDrawDefinition({ tournamentRecord, drawId: 'any-draw-id' });
    expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);
  });
});
