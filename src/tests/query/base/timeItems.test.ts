import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import {
  INVALID_VALUES,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_PARTICIPANT_ID,
  MISSING_TIME_ITEMS,
  MISSING_TOURNAMENT_RECORD,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';
import {
  getTimeItem,
  getDrawDefinitionTimeItem,
  getEventTimeItem,
  getTournamentTimeItem,
  getParticipantTimeItem,
} from '@Query/base/timeItems';

describe('getTimeItem', () => {
  it('returns error when element has error', () => {
    const result = getTimeItem({
      element: { error: 'SOME_ERROR' },
      itemType: 'TEST',
    });

    expect(result.error).toEqual('SOME_ERROR');
  });

  it('returns error when itemSubTypes is not an array', () => {
    const element = { timeItems: [] };
    const result = getTimeItem({
      element,
      itemType: 'TEST',
      itemSubTypes: 'not-an-array' as any,
    });

    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context).toMatchObject({ itemSubTypes: 'not-an-array' });
  });

  it('returns error when element has no timeItems array', () => {
    const element = { id: 'test' };
    const result = getTimeItem({
      element,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_TIME_ITEMS);
  });

  it('returns NOT_FOUND info when no matching timeItem', () => {
    const element = {
      timeItems: [{ itemType: 'OTHER', createdAt: new Date().toISOString() }],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
    });

    expect(result.info).toEqual(NOT_FOUND);
  });

  it('returns most recent timeItem when multiple match', () => {
    const now = new Date();
    const older = new Date(now.getTime() - 1000);

    const element = {
      timeItems: [
        { itemType: 'TEST', value: 'old', createdAt: older.toISOString() },
        { itemType: 'TEST', value: 'new', createdAt: now.toISOString() },
      ],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
    });

    expect(result.timeItem.value).toEqual('new');
  });

  it('filters by itemSubTypes when provided', () => {
    const element = {
      timeItems: [
        { itemType: 'TEST', itemSubTypes: ['A'], value: 'typeA', createdAt: new Date().toISOString() },
        { itemType: 'TEST', itemSubTypes: ['B'], value: 'typeB', createdAt: new Date().toISOString() },
      ],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
      itemSubTypes: ['A'],
    });

    expect(result.timeItem.value).toEqual('typeA');
  });

  it('returns previousItems when returnPreviousValues is true', () => {
    const element = {
      timeItems: [
        { itemType: 'TEST', value: 'v1', createdAt: '2024-01-01' },
        { itemType: 'TEST', value: 'v2', createdAt: '2024-01-02' },
        { itemType: 'TEST', value: 'v3', createdAt: '2024-01-03' },
      ],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
      returnPreviousValues: true,
    });

    expect(result.timeItem.value).toEqual('v3');
    expect(result.previousItems).toHaveLength(2);
    expect(result.previousItems[0].value).toEqual('v1');
  });

  it('does not return previousItems when returnPreviousValues is false', () => {
    const element = {
      timeItems: [
        { itemType: 'TEST', value: 'v1', createdAt: '2024-01-01' },
        { itemType: 'TEST', value: 'v2', createdAt: '2024-01-02' },
      ],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
      returnPreviousValues: false,
    });

    expect(result.timeItem).toBeDefined();
    expect(result.previousItems).toBeUndefined();
  });

  it('handles timeItems with undefined createdAt', () => {
    const element = {
      timeItems: [
        { itemType: 'TEST', value: 'v1', createdAt: undefined },
        { itemType: 'TEST', value: 'v2', createdAt: undefined },
      ],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
    });

    // Should not throw, should return one of them
    expect(result.timeItem).toBeDefined();
  });

  it('filters multiple itemSubTypes', () => {
    const element = {
      timeItems: [
        { itemType: 'TEST', itemSubTypes: ['A'], value: 'typeA', createdAt: new Date().toISOString() },
        { itemType: 'TEST', itemSubTypes: ['B'], value: 'typeB', createdAt: new Date().toISOString() },
        { itemType: 'TEST', itemSubTypes: ['C'], value: 'typeC', createdAt: new Date().toISOString() },
      ],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
      itemSubTypes: ['A', 'C'],
    });

    expect(['typeA', 'typeC']).toContain(result.timeItem.value);
  });

  it('returns empty previousItems when only one timeItem matches', () => {
    const element = {
      timeItems: [{ itemType: 'TEST', value: 'only', createdAt: new Date().toISOString() }],
    };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
      returnPreviousValues: true,
    });

    expect(result.timeItem.value).toEqual('only');
    expect(result.previousItems).toEqual([]);
  });

  it('makes deep copy of timeItem', () => {
    const timeItem = { itemType: 'TEST', value: { nested: 'data' }, createdAt: new Date().toISOString() };
    const element = { timeItems: [timeItem] };

    const result = getTimeItem({
      element,
      itemType: 'TEST',
    });

    // Modify returned timeItem
    result.timeItem.value.nested = 'modified';

    // Original should be unchanged
    expect(timeItem.value.nested).toEqual('data');
  });
});

describe('getDrawDefinitionTimeItem', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = getDrawDefinitionTimeItem({
      drawDefinition: null as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('returns error when drawDefinition is undefined', () => {
    const result = getDrawDefinitionTimeItem({
      drawDefinition: undefined as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('returns NOT_FOUND info when drawDefinition has no timeItems', () => {
    const drawDefinition = { drawId: 'test' };

    const result = getDrawDefinitionTimeItem({
      drawDefinition,
      itemType: 'TEST',
    });

    expect(result.info).toEqual(NOT_FOUND);
  });

  it('returns timeItem from drawDefinition', () => {
    const drawDefinition = {
      drawId: 'test',
      timeItems: [{ itemType: 'TEST', value: 'test', createdAt: new Date().toISOString() }],
    };

    const result = getDrawDefinitionTimeItem({
      drawDefinition,
      itemType: 'TEST',
    });

    expect(result.timeItem.value).toEqual('test');
  });

  it('returns previousItems when requested', () => {
    const drawDefinition = {
      drawId: 'test',
      timeItems: [
        { itemType: 'TEST', value: 'v1', createdAt: '2024-01-01' },
        { itemType: 'TEST', value: 'v2', createdAt: '2024-01-02' },
      ],
    };

    const result = getDrawDefinitionTimeItem({
      drawDefinition,
      itemType: 'TEST',
      returnPreviousValues: true,
    });

    expect(result.timeItem.value).toEqual('v2');
    expect(result.previousItems).toHaveLength(1);
  });
});

describe('getEventTimeItem', () => {
  it('returns error when event is missing', () => {
    const result = getEventTimeItem({
      event: null as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns error when event is undefined', () => {
    const result = getEventTimeItem({
      event: undefined as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns NOT_FOUND info when event has no timeItems', () => {
    const event = { eventId: 'test' };

    const result = getEventTimeItem({
      event,
      itemType: 'TEST',
    });

    expect(result.info).toEqual(NOT_FOUND);
  });

  it('returns timeItem from event', () => {
    const event = {
      eventId: 'test',
      timeItems: [{ itemType: 'TEST', value: 'test', createdAt: new Date().toISOString() }],
    };

    const result = getEventTimeItem({
      event,
      itemType: 'TEST',
    });

    expect(result.timeItem.value).toEqual('test');
  });

  it('filters by itemSubTypes', () => {
    const event = {
      eventId: 'test',
      timeItems: [
        { itemType: 'TEST', itemSubTypes: ['A'], value: 'typeA', createdAt: new Date().toISOString() },
        { itemType: 'TEST', itemSubTypes: ['B'], value: 'typeB', createdAt: new Date().toISOString() },
      ],
    };

    const result = getEventTimeItem({
      event,
      itemType: 'TEST',
      itemSubTypes: ['B'],
    });

    expect(result.timeItem.value).toEqual('typeB');
  });
});

describe('getTournamentTimeItem', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = getTournamentTimeItem({
      tournamentRecord: null as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when tournamentRecord is undefined', () => {
    const result = getTournamentTimeItem({
      tournamentRecord: undefined as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns NOT_FOUND info when tournamentRecord has no timeItems', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getTournamentTimeItem({
      tournamentRecord,
      itemType: 'TEST',
    });

    expect(result.info).toEqual(NOT_FOUND);
  });

  it('returns timeItem from tournamentRecord', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentRecord.timeItems = [{ itemType: 'TEST', value: 'test', createdAt: new Date().toISOString() }];

    const result = getTournamentTimeItem({
      tournamentRecord,
      itemType: 'TEST',
    });

    expect(result.timeItem.value).toEqual('test');
  });
});

describe('getParticipantTimeItem', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = getParticipantTimeItem({
      tournamentRecord: null as any,
      participantId: 'test',
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when participantId is missing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getParticipantTimeItem({
      tournamentRecord,
      participantId: null as any,
      itemType: 'TEST',
    });

    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('returns error when participant not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
    });

    const result = getParticipantTimeItem({
      tournamentRecord,
      participantId: 'nonexistent',
      itemType: 'TEST',
    });

    expect(result.error).toBeDefined();
  });

  it('returns NOT_FOUND info when participant has no timeItems', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
    });

    const participantId = tournamentRecord.participants[0].participantId;

    const result = getParticipantTimeItem({
      tournamentRecord,
      participantId,
      itemType: 'TEST',
    });

    expect(result.info).toEqual(NOT_FOUND);
  });

  it('returns timeItem from participant', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
    });

    const participantId = tournamentRecord.participants[0].participantId;
    tournamentRecord.participants[0].timeItems = [
      { itemType: 'TEST', value: 'test', createdAt: new Date().toISOString() },
    ];

    const result = getParticipantTimeItem({
      tournamentRecord,
      participantId,
      itemType: 'TEST',
    });

    expect(result.timeItem.value).toEqual('test');
  });

  it('filters by itemSubTypes', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 1 },
    });

    const participantId = tournamentRecord.participants[0].participantId;
    tournamentRecord.participants[0].timeItems = [
      { itemType: 'TEST', itemSubTypes: ['A'], value: 'typeA', createdAt: new Date().toISOString() },
      { itemType: 'TEST', itemSubTypes: ['B'], value: 'typeB', createdAt: new Date().toISOString() },
    ];

    const result = getParticipantTimeItem({
      tournamentRecord,
      participantId,
      itemType: 'TEST',
      itemSubTypes: ['A'],
    });

    expect(result.timeItem.value).toEqual('typeA');
  });

  it('returns previousItems when requested', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 1 },
    });

    const participantId = tournamentRecord.participants[0].participantId;
    tournamentRecord.participants[0].timeItems = [
      { itemType: 'TEST', value: 'v1', createdAt: '2024-01-01' },
      { itemType: 'TEST', value: 'v2', createdAt: '2024-01-02' },
    ];

    const result = getParticipantTimeItem({
      tournamentRecord,
      participantId,
      itemType: 'TEST',
      returnPreviousValues: true,
    });

    expect(result.timeItem.value).toEqual('v2');
    expect(result.previousItems).toHaveLength(1);
  });
});
