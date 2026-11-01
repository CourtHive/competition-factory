import { eventDateResolver, eventPlaysOnDate, getEventPlayingDates, weekdayOf } from '@Query/events/eventPlaysOnDate';
import { describe, expect, it } from 'vitest';

// constants and types
import { MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Event, Tournament } from '@Types/tournamentTypes';

// 2026-11-13 is a Friday; the tournament runs Fri 13 .. Mon 16.
// This module must answer the same in every time zone: run it under TZ=Pacific/Auckland and TZ=America/Los_Angeles too.
const tournament = (attributes: Partial<Tournament> = {}): Tournament =>
  ({ tournamentId: 't1', startDate: '2026-11-13', endDate: '2026-11-16', ...attributes }) as Tournament;
const event = (attributes: Partial<Event> = {}): Event => ({ eventId: 'e1', ...attributes }) as Event;

describe('eventPlaysOnDate', () => {
  it.each([
    // [label, tournament attributes, event attributes (undefined: no event), date, expected reason or true]
    ['plays with nothing set', {}, {}, '2026-11-14', true],
    ['no event: tournament rules only', {}, undefined, '2026-11-14', true],
    ['an invalid date fails closed', {}, {}, '2026-11-31', 'INVALID_DATE'],
    ['a date-time is not a day', {}, {}, '2026-11-14T10:00', 'INVALID_DATE'],
    ['a non-string fails closed', {}, {}, undefined, 'INVALID_DATE'],
    ['before the tournament', {}, {}, '2026-11-12', 'OUTSIDE_TOURNAMENT_DATES'],
    ['after the tournament', {}, undefined, '2026-11-17', 'OUTSIDE_TOURNAMENT_DATES'],
    ['before the event range', {}, { startDate: '2026-11-14' }, '2026-11-13', 'OUTSIDE_EVENT_DATES'],
    ['after the event range', {}, { endDate: '2026-11-14' }, '2026-11-15', 'OUTSIDE_EVENT_DATES'],
    ['inside the event range', {}, { startDate: '2026-11-14', endDate: '2026-11-15' }, '2026-11-15', true],
    ['a disjoint event range is ignored', {}, { startDate: '2026-11-20', endDate: '2026-11-22' }, '2026-11-14', true],
    [
      'a disjoint range still bounded by the tournament',
      {},
      { startDate: '2026-11-20' },
      '2026-11-20',
      'OUTSIDE_TOURNAMENT_DATES',
    ],
    ['an inverted event range is ignored', {}, { startDate: '2026-11-15', endDate: '2026-11-14' }, '2026-11-13', true],
    [
      'not a tournament active date',
      { activeDates: ['2026-11-13', '2026-11-15'] },
      {},
      '2026-11-14',
      'TOURNAMENT_INACTIVE_DATE',
    ],
    ['a tournament active date', { activeDates: ['2026-11-13', '2026-11-15'] }, {}, '2026-11-15', true],
    ['not a tournament weekday', { weekdays: ['FRI', 'SUN'] }, undefined, '2026-11-14', 'TOURNAMENT_WEEKDAY'],
    [
      'tournament activeDates beat tournament weekdays',
      { activeDates: ['2026-11-14'], weekdays: ['FRI'] },
      {},
      '2026-11-14',
      true,
    ],
    [
      'tournament [] activeDates means unset',
      { activeDates: [], weekdays: ['SAT'] },
      {},
      '2026-11-13',
      'TOURNAMENT_WEEKDAY',
    ],
    ['tournament [] weekdays means unset', { weekdays: [] }, {}, '2026-11-14', true],
    ['not an event active date', {}, { activeDates: ['2026-11-13'] }, '2026-11-14', 'EVENT_INACTIVE_DATE'],
    ['an event active date', {}, { activeDates: ['2026-11-13'] }, '2026-11-13', true],
    ['not an event weekday', {}, { weekdays: ['SAT'] }, '2026-11-13', 'EVENT_WEEKDAY'],
    ['an event weekday', {}, { weekdays: ['SAT'] }, '2026-11-14', true],
    [
      'event activeDates beat event weekdays',
      {},
      { activeDates: ['2026-11-13'], weekdays: ['SAT'] },
      '2026-11-13',
      true,
    ],
    [
      'event activeDates beat weekdays, refusing',
      {},
      { activeDates: ['2026-11-13'], weekdays: ['SAT'] },
      '2026-11-14',
      'EVENT_INACTIVE_DATE',
    ],
    ['event [] activeDates means unset', {}, { activeDates: [], weekdays: ['SAT'] }, '2026-11-13', 'EVENT_WEEKDAY'],
    ['event [] weekdays means unset', {}, { weekdays: [] }, '2026-11-13', true],
    ['unknown weekday codes are ignored', {}, { weekdays: ['XYZ'] }, '2026-11-13', true],
    ['Date values in activeDates', {}, { activeDates: [new Date('2026-11-15')] }, '2026-11-15', true],
    [
      'Date values in activeDates, refusing',
      {},
      { activeDates: [new Date('2026-11-15')] },
      '2026-11-14',
      'EVENT_INACTIVE_DATE',
    ],
    ['invalid Date values are dropped', {}, { activeDates: [new Date('x')] }, '2026-11-14', true],
    ['date-time strings in activeDates', {}, { activeDates: ['2026-11-15T00:00'] }, '2026-11-15', true],
    [
      'tournament rule reported before event rule',
      { activeDates: ['2026-11-13'] },
      { weekdays: ['SAT'] },
      '2026-11-14',
      'TOURNAMENT_INACTIVE_DATE',
    ],
    [
      'range reported before active dates',
      {},
      { startDate: '2026-11-14', activeDates: ['2026-11-15'] },
      '2026-11-13',
      'OUTSIDE_EVENT_DATES',
    ],
  ])('%s', (_label, tournamentAttributes: any, eventAttributes: any, date: any, expected) => {
    const verdict = eventPlaysOnDate({
      event: eventAttributes ? event(eventAttributes) : undefined,
      tournamentRecord: tournament(tournamentAttributes),
      date,
    });
    if (expected === true) expect(verdict).toEqual({ plays: true });
    else expect(verdict).toEqual({ plays: false, reason: expected });
  });

  it('a tournament without dates applies only active dates and weekdays', () => {
    const tournamentRecord = { tournamentId: 't1' } as Tournament;
    expect(eventPlaysOnDate({ tournamentRecord, date: '2030-01-01' })).toEqual({ plays: true });
    expect(eventPlaysOnDate({ tournamentRecord, event: event({ weekdays: ['SAT'] }), date: '2026-11-13' })).toEqual({
      plays: false,
      reason: 'EVENT_WEEKDAY',
    });
  });

  it('reads the weekday of the calendar day in UTC', () => {
    expect(weekdayOf('2026-11-13')).toEqual('FRI');
    expect(weekdayOf('2026-11-14')).toEqual('SAT');
    expect(weekdayOf('2026-11-15')).toEqual('SUN');
    expect(weekdayOf('2027-01-01')).toEqual('FRI');
  });
});

describe('eventDateResolver', () => {
  it('agrees with eventPlaysOnDate and resolves per event', () => {
    const tournamentRecord = tournament({
      events: [event({ eventId: 'sat', weekdays: ['SAT'] }), event({ eventId: 'fri', weekdays: ['FRI'] })],
    });
    const resolve = eventDateResolver({ t1: tournamentRecord });
    for (const date of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-20', 'bad']) {
      for (const eventId of ['sat', 'fri']) {
        const expected = eventPlaysOnDate({
          event: tournamentRecord.events?.find((candidate) => candidate.eventId === eventId),
          tournamentRecord,
          date,
        });
        expect(resolve({ tournamentId: 't1', eventId, date })).toEqual(expected);
        // asked twice: the memoised rule answers the same
        expect(resolve({ tournamentId: 't1', eventId, date })).toEqual(expected);
      }
    }
    expect(resolve({ tournamentId: 't1', eventId: 'sat', date: '2026-11-13' })).toEqual({
      plays: false,
      reason: 'EVENT_WEEKDAY',
    });
    expect(resolve({ tournamentId: 't1', eventId: 'fri', date: '2026-11-13' })).toEqual({ plays: true });
  });

  it('an unknown event resolves with the tournament rules; an unknown tournament with none', () => {
    const resolve = eventDateResolver({ t1: tournament() });
    expect(resolve({ tournamentId: 't1', eventId: 'unknown', date: '2026-11-20' })).toEqual({
      plays: false,
      reason: 'OUTSIDE_TOURNAMENT_DATES',
    });
    expect(resolve({ tournamentId: 't1', date: '2026-11-14' })).toEqual({ plays: true });
    expect(resolve({ tournamentId: 'unknown', date: '2026-11-20' })).toEqual({ plays: true });
  });
});

describe('getEventPlayingDates', () => {
  it.each([
    ['nothing set', {}, {}, ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'], false],
    ['weekdays', {}, { weekdays: ['FRI', 'SUN'] }, ['2026-11-13', '2026-11-15'], true],
    ['activeDates beat weekdays', {}, { activeDates: ['2026-11-14'], weekdays: ['FRI'] }, ['2026-11-14'], true],
    ['a narrowed range', {}, { startDate: '2026-11-14', endDate: '2026-11-15' }, ['2026-11-14', '2026-11-15'], true],
    [
      'the tournament range',
      {},
      { startDate: '2026-11-13', endDate: '2026-11-16' },
      ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
      false,
    ],
    [
      'a disjoint range is ignored',
      {},
      { startDate: '2026-11-20', endDate: '2026-11-21' },
      ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
      false,
    ],
    [
      'tournament activeDates do not constrain the event',
      { activeDates: ['2026-11-13', '2026-11-16'] },
      {},
      ['2026-11-13', '2026-11-16'],
      false,
    ],
    [
      'tournament weekdays and event weekdays',
      { weekdays: ['FRI', 'SAT'] },
      { weekdays: ['SAT', 'SUN'] },
      ['2026-11-14'],
      true,
    ],
    [
      '[] means unset',
      {},
      { activeDates: [], weekdays: [] },
      ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
      false,
    ],
  ])('%s', (_label, tournamentAttributes: any, eventAttributes: any, playingDates, constrained) => {
    const result = getEventPlayingDates({
      tournamentRecord: tournament(tournamentAttributes),
      event: event(eventAttributes),
    });
    expect(result).toEqual({ success: true, playingDates, constrained });
  });

  it('enumerates the event range when the tournament has no dates', () => {
    const tournamentRecord = { tournamentId: 't1' } as Tournament;
    let result: any = getEventPlayingDates({
      event: event({ startDate: '2026-11-14', endDate: '2026-11-15' }),
      tournamentRecord,
    });
    expect(result.playingDates).toEqual(['2026-11-14', '2026-11-15']);
    expect(result.constrained).toEqual(true);
    result = getEventPlayingDates({ tournamentRecord, event: event() });
    expect(result).toEqual({ success: true, playingDates: [], constrained: false });
  });

  it('refuses without a tournament or an event', () => {
    expect(getEventPlayingDates({ event: event() } as any).error).toEqual(MISSING_TOURNAMENT_RECORD);
    expect(getEventPlayingDates({ tournamentRecord: tournament() } as any).error).toEqual(MISSING_EVENT);
  });
});
