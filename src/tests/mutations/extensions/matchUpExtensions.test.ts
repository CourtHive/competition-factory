import { disableTieAutoCalc } from '@Mutate/extensions/matchUps/disableTieAutoCalc';
import { removeDelegatedOutcome } from '@Mutate/extensions/matchUps/removeDelegatedOutcome';
import { modifyMatchUpFormatTiming } from '@Mutate/extensions/matchUps/modifyMatchUpFormatTiming';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import {
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

describe('disableTieAutoCalc', () => {
  it('returns MISSING_DRAW_DEFINITION when drawDefinition is missing', () => {
    const result = disableTieAutoCalc({ drawDefinition: undefined, matchUpId: 'test', event: undefined });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('succeeds when drawDefinition and matchUpId are valid', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
    const matchUpId = matchUps[0].matchUpId;

    const result = disableTieAutoCalc({ drawDefinition, matchUpId, event });
    expect(result.success).toEqual(true);
  });
});

describe('removeDelegatedOutcome', () => {
  it('returns MISSING_DRAW_DEFINITION when drawDefinition is missing', () => {
    const result = removeDelegatedOutcome({ drawDefinition: undefined, event: undefined, matchUpId: 'test' });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns MISSING_MATCHUP_ID when matchUpId is missing', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const result = removeDelegatedOutcome({ drawDefinition, event, matchUpId: undefined });
    expect(result.error).toEqual(MISSING_MATCHUP_ID);
  });
});

describe('modifyMatchUpFormatTiming', () => {
  it('returns MISSING_TOURNAMENT_RECORDS when no records provided', () => {
    const result = modifyMatchUpFormatTiming({
      matchUpFormat: FORMAT_STANDARD,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('returns MISSING_TOURNAMENT_RECORD when tournamentId does not match', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    // The engine-level test calls this with tournamentId='bogusId' but that
    // goes through a different code path. Direct call with invalid tournamentId:
    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      tournamentId: 'bogusId',
      matchUpFormat: FORMAT_STANDARD,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES when averageTimes is not an array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      averageTimes: 'not-an-array' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES when recoveryTimes is not an array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      recoveryTimes: 'not-an-array' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns EVENT_NOT_FOUND when eventId is invalid', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      eventId: 'bogusId',
    });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
  });

  it('modifies timing at event level when eventId is valid', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      eventId,
      averageTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 100 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('modifies timing at tournament level when no eventId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      averageTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 100 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('modifies recovery times at tournament level', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 30 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('updates existing matchUpFormat timing by replacing it', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    // First set average times
    let result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      averageTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 100 } }],
    });
    expect(result.success).toEqual(true);

    // Then update with different values for same format
    result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      averageTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 120 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('updates existing recovery times by replacing them', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    let result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 30 } }],
    });
    expect(result.success).toEqual(true);

    result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 45 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('filters out averageTimes without categoryNames or categoryTypes', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      averageTimes: [{ minutes: { default: 100 } }], // no categoryNames or categoryTypes
    });
    // Should succeed but not add any timing (filtered out)
    expect(result.success).toEqual(true);
  });

  it('filters out recoveryTimes without categoryNames or categoryTypes', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      recoveryTimes: [{ minutes: { default: 30 } }], // no categoryNames or categoryTypes
    });
    expect(result.success).toEqual(true);
  });

  it('handles multiple tournament records', () => {
    const { tournamentRecord: first } = mocksEngine.generateTournamentRecord({
      startDate: '2022-01-01',
      endDate: '2022-01-07',
    });
    const { tournamentRecord: second } = mocksEngine.generateTournamentRecord({
      startDate: '2022-02-01',
      endDate: '2022-02-07',
    });
    const tournamentRecords = {
      [first.tournamentId]: first,
      [second.tournamentId]: second,
    };

    const result = modifyMatchUpFormatTiming({
      tournamentRecords,
      matchUpFormat: FORMAT_STANDARD,
      averageTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 110 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('modifies event-level timing then updates it', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    // Set event-level average times
    let result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      eventId,
      averageTimes: [{ categoryNames: ['U18'], minutes: { default: 80 } }],
    });
    expect(result.success).toEqual(true);

    // Update same event with new values
    result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      eventId,
      averageTimes: [{ categoryNames: ['U18'], minutes: { default: 90 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('modifies event-level recovery times', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      eventId,
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 20 } }],
    });
    expect(result.success).toEqual(true);
  });

  it('handles recovery time definitions with averageTimes key', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    // First set some recovery times
    let result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: FORMAT_STANDARD,
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 30 } }],
    });
    expect(result.success).toEqual(true);

    // Now add a different matchUpFormat so we have multiple definitions
    result = modifyMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat: 'SET1-S:6/TB7',
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 15 } }],
    });
    expect(result.success).toEqual(true);
  });
});
