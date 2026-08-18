import { generateDrawMaticRound } from '@Assemblies/generators/drawDefinitions/drawTypes/adHoc/drawMatic/generateDrawMaticRound';
import { getTieMatchUpContext } from '@Query/hierarchical/tieFormats/getTieMatchUpContext';
import { setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { addPracticeRegistration } from '@Mutate/practice/addPracticeRegistration';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addNotice,
  getSaveDrawDeletions,
  setAuditAuthorityServer,
  setGlobalMethods,
  setMethods,
  setSaveDrawDeletions,
} from '@Global/state/globalState';

// constants and types
import { PRACTICE } from '@Constants/scheduleConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_ID,
  MISSING_PARTICIPANT_IDS,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * Second batch of parameter-guard branches — see `parameterGuardBranches.test.ts`
 * for why these are worth covering and how the pool was identified.
 *
 * Every group asserts its specific error code and carries a control proving a
 * well-formed call still succeeds, so a function that rejected everything could
 * not satisfy the group.
 */

const TEST_DATE = '2026-06-15';

describe('globalState — flag and declaration guards', () => {
  afterEach(() => {
    setSaveDrawDeletions();
    setAuditAuthorityServer();
  });

  it('setSaveDrawDeletions rejects a non-boolean flag', () => {
    expect((setSaveDrawDeletions as any)('yes').error).toEqual(INVALID_VALUES);
    expect((setSaveDrawDeletions as any)(1).error).toEqual(INVALID_VALUES);
  });

  it('setAuditAuthorityServer rejects a non-boolean flag', () => {
    expect((setAuditAuthorityServer as any)('yes').error).toEqual(INVALID_VALUES);
  });

  it('control: booleans are accepted and undefined resets to false', () => {
    expect(setSaveDrawDeletions(true).success).toEqual(true);
    expect(getSaveDrawDeletions()).toEqual(true);
    expect(setSaveDrawDeletions().success).toEqual(true);
    expect(getSaveDrawDeletions()).toEqual(false);
  });

  it('setGlobalMethods rejects missing or non-object declarations', () => {
    expect((setGlobalMethods as any)().error).toEqual(MISSING_VALUE);
    expect((setGlobalMethods as any)('nope').error).toEqual(INVALID_VALUES);
  });

  it('setMethods rejects missing or non-object declarations', () => {
    expect((setMethods as any)().error).toEqual(MISSING_VALUE);
    expect((setMethods as any)('nope').error).toEqual(INVALID_VALUES);
  });

  it('addNotice ignores a notice with no string topic', () => {
    // Returns undefined rather than throwing — a malformed notice must not take
    // down the mutation that emitted it.
    expect((addNotice as any)(undefined)).toBeUndefined();
    expect((addNotice as any)({ payload: {} })).toBeUndefined();
    expect((addNotice as any)({ topic: 7, payload: {} })).toBeUndefined();
  });
});

describe('setGroupLeafOrExtension — parameter guards', () => {
  it('returns MISSING_VALUE when params is not an object', () => {
    expect((setGroupLeafOrExtension as any)(undefined).error).toEqual(MISSING_VALUE);
  });

  it('returns INVALID_VALUES for a missing or non-object element', () => {
    const base = { groupAttribute: 'g', leafAttribute: 'l', name: 'n', value: 1 };
    expect((setGroupLeafOrExtension as any)(base).error).toEqual(INVALID_VALUES);
    expect((setGroupLeafOrExtension as any)({ ...base, element: 'x' }).error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for a missing or empty groupAttribute', () => {
    const base = { element: {}, leafAttribute: 'l', name: 'n', value: 1 };
    expect((setGroupLeafOrExtension as any)(base).error).toEqual(INVALID_VALUES);
    expect((setGroupLeafOrExtension as any)({ ...base, groupAttribute: '' }).error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for a missing or empty leafAttribute', () => {
    const base = { element: {}, groupAttribute: 'g', name: 'n', value: 1 };
    expect((setGroupLeafOrExtension as any)(base).error).toEqual(INVALID_VALUES);
    expect((setGroupLeafOrExtension as any)({ ...base, leafAttribute: '' }).error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for a missing or empty name', () => {
    const base = { element: {}, groupAttribute: 'g', leafAttribute: 'l', value: 1 };
    expect((setGroupLeafOrExtension as any)(base).error).toEqual(INVALID_VALUES);
    expect((setGroupLeafOrExtension as any)({ ...base, name: '' }).error).toEqual(INVALID_VALUES);
  });

  it('control: a well-formed call succeeds', () => {
    const element: any = {};
    const result: any = setGroupLeafOrExtension({
      element,
      groupAttribute: 'schedule',
      leafAttribute: 'scheduledTime',
      name: 'scheduledTime',
      value: '14:00',
    });
    expect(result.success).toEqual(true);
  });
});

describe('addPracticeRegistration — parameter guards', () => {
  function seeded() {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
      venueProfiles: [{ courtsCount: 1, venueId: 'v1' }],
      startDate: TEST_DATE,
      endDate: TEST_DATE,
      nonRandom: 1,
      setState: true,
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const court = tournamentRecord.venues[0].courts[0];
    court.dateAvailability = [
      {
        date: TEST_DATE,
        startTime: '08:00',
        endTime: '20:00',
        bookings: [{ bookingId: 'booking-1', bookingType: PRACTICE, startTime: '14:00', endTime: '16:00' }],
      },
    ];
    return {
      tournamentRecord,
      courtId: court.courtId,
      participantId: tournamentRecord.participants[0].participantId,
    };
  }

  const base = { bookingId: 'booking-1', date: TEST_DATE, startTime: '14:00', endTime: '15:00' };

  const guardCases: Array<[string, Record<string, any>]> = [
    ['date is missing', { date: undefined }],
    ['bookingId is missing', { bookingId: undefined }],
    ['startTime is missing', { startTime: undefined }],
    ['endTime is missing', { endTime: undefined }],
  ];

  it.each(guardCases)('rejects with INVALID_VALUES when %s', (_label, override) => {
    const s = seeded();
    const result: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      participantId: s.participantId,
      ...base,
      ...override,
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('control: the same call with every parameter present succeeds', () => {
    const s = seeded();
    const result: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      participantId: s.participantId,
      ...base,
    });
    expect(result.success).toEqual(true);
  });
});

describe('getTieMatchUpContext — parameter guards', () => {
  it('returns MISSING_TOURNAMENT_RECORD without a tournamentRecord', () => {
    expect((getTieMatchUpContext as any)({}).error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns MISSING_DRAW_ID without a drawDefinition', () => {
    expect((getTieMatchUpContext as any)({ tournamentRecord: {} }).error).toEqual(MISSING_DRAW_ID);
  });

  it('returns EVENT_NOT_FOUND without an event', () => {
    const result: any = (getTieMatchUpContext as any)({ tournamentRecord: {}, drawDefinition: { drawId: 'd' } });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
  });
});

describe('generateDrawMaticRound — parameter guards', () => {
  it('returns MISSING_DRAW_DEFINITION without a drawDefinition', () => {
    expect((generateDrawMaticRound as any)({}).error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns STRUCTURE_NOT_FOUND when neither structure nor structureId is supplied', () => {
    const result: any = (generateDrawMaticRound as any)({ drawDefinition: { drawId: 'd', structures: [] } });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('returns MISSING_PARTICIPANT_IDS when the structure resolves but no participants are given', () => {
    const result: any = (generateDrawMaticRound as any)({
      drawDefinition: { drawId: 'd', structures: [] },
      structure: { structureId: 's', matchUps: [] },
      participantIds: [],
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_IDS);
  });
});
