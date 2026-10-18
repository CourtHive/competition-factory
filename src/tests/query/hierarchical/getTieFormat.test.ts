import { getTieFormat } from '@Query/hierarchical/getTieFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  MISSING_DRAW_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  MATCHUP_NOT_FOUND,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

describe('getTieFormat', () => {
  // Unit tests - parameter validation
  it('returns error when tournamentRecord is missing', () => {
    const result = getTieFormat({
      tournamentRecord: null as any,
      matchUpId: 'test',
    });

    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when tournamentRecord is undefined', () => {
    const result = getTieFormat({
      tournamentRecord: undefined as any,
      matchUpId: 'test',
    });

    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when no identifying parameters provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getTieFormat({
      tournamentRecord,
    } as any);

    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when structureId provided without drawDefinition', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const result = getTieFormat({
      tournamentRecord,
      structureId: 'test',
      matchUpId: undefined as any,
    });

    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('returns error when structureId is invalid', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = getTieFormat({
      tournamentRecord,
      drawDefinition,
      structureId: 'nonexistent',
      matchUpId: undefined as any,
    });

    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('returns error when matchUpId is invalid', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: 'nonexistent',
    });

    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });

  // Integration tests with team events
  it('retrieves tieFormat from team event', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const matchUp = drawDefinition.structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
    expect(result.tieFormat).toBeDefined();
  });

  it('retrieves tieFormat using drawId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = getTieFormat({
      tournamentRecord,
      drawId: drawDefinition.drawId,
      matchUpId: drawDefinition.structures[0].matchUps[0].matchUpId,
    });

    expect(result.success).toBe(true);
  });

  it('retrieves tieFormat using eventId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];

    const result = getTieFormat({
      tournamentRecord,
      eventId: event.eventId,
      matchUpId: event.drawDefinitions[0].structures[0].matchUps[0].matchUpId,
    });

    expect(result.success).toBe(true);
  });

  it('retrieves tieFormat using event object', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const matchUp = event.drawDefinitions[0].structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      event,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
    expect(result.tieFormat).toBeDefined();
  });

  it('retrieves tieFormat using structureId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structure = drawDefinition.structures[0];

    const result = getTieFormat({
      tournamentRecord,
      drawDefinition,
      structureId: structure.structureId,
      matchUpId: undefined as any,
    });

    expect(result.success).toBe(true);
  });

  it('retrieves tieFormat using structure object', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structure = drawDefinition.structures[0];
    const matchUp = structure.matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      structure,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
  });

  it('returns drawDefaultTieFormat when present', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const matchUp = drawDefinition.structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    if (drawDefinition.tieFormat || drawDefinition.tieFormatId) {
      expect(result.drawDefaultTieFormat).toBeDefined();
    }
  });

  it('returns structureDefaultTieFormat when present', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
    const matchUp = structure.matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    if (structure.tieFormat || structure.tieFormatId) {
      expect(result.structureDefaultTieFormat).toBeDefined();
    }
  });

  it('returns matchUp in result', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.matchUp).toBeDefined();
    expect(result?.matchUp?.matchUpId).toBe(matchUp.matchUpId);
  });

  it('returns deep copies of tieFormats', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    if (result.tieFormat) {
      // Modify returned tieFormat
      result.tieFormat.winCriteria = { valueGoal: 999 };

      // Get tieFormat again
      const result2 = getTieFormat({
        tournamentRecord,
        matchUpId: matchUp.matchUpId,
      });

      // Should not be modified (deep copy)
      expect(result2?.tieFormat?.winCriteria?.valueGoal).not.toBe(999);
    }
  });

  it('resolves eventId to event object', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const matchUp = event.drawDefinitions[0].structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      eventId: event.eventId,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
    expect(result.eventDefaultTieFormat).toBeDefined();
  });

  it('handles non-existent eventId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      eventId: 'nonexistent',
      matchUpId: matchUp.matchUpId,
    });

    // Should still work, just no event-specific tieFormat
    expect(result.success).toBe(true);
  });

  it('resolves drawDefinition from matchUpResult', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

    // Not providing drawDefinition - should resolve internally
    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
    expect(result.tieFormat).toBeDefined();
  });

  it('handles matchUpId with drawId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const matchUp = drawDefinition.structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
    expect(result.tieFormat).toBeDefined();
  });

  it('handles multiple team events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { eventType: TEAM_EVENT, drawSize: 4 },
        { eventType: TEAM_EVENT, drawSize: 8 },
      ],
    });

    const matchUp1 = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];
    const matchUp2 = tournamentRecord.events[1].drawDefinitions[0].structures[0].matchUps[0];

    const result1 = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp1.matchUpId,
    });

    const result2 = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp2.matchUpId,
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1?.matchUp?.matchUpId).toBe(matchUp1.matchUpId);
    expect(result2?.matchUp?.matchUpId).toBe(matchUp2.matchUpId);
  });

  it('handles structureId without matchUpId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structureId = drawDefinition.structures[0].structureId;

    const result = getTieFormat({
      tournamentRecord,
      drawDefinition,
      structureId,
      matchUpId: undefined as any,
    });

    expect(result.success).toBe(true);
    expect(result.structure).toBeDefined();
  });

  it('returns undefined tieFormats when none are set', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }], // Non-team event
    });

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

    const result = getTieFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.success).toBe(true);
    // Non-team events may not have tieFormats
    expect(result.tieFormat).toBeUndefined();
  });

  it('handles empty tournamentRecord.events', () => {
    const tournamentRecord = {
      tournamentId: 'test',
      events: [],
    };

    const result = getTieFormat({
      tournamentRecord: tournamentRecord as any,
      eventId: 'test',
      matchUpId: 'test',
    });

    // Should handle gracefully
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });
});
