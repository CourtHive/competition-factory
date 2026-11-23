import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { MATCHUPS_SCHEDULED_OUTSIDE_DATES } from '@Constants/errorConditionConstants';
import { MODIFY_EVENT } from '@Constants/topicConstants';

// R1 (CA ruling 2026-11-01): setTournamentDates carries events whose range tracked the tournament's,
// clamps narrower event ranges into the new range, and never leaves an event range outside it.

const startDate = '2025-06-02';
const endDate = '2025-06-08';
const trackingId = 'tracking';
const narrowId = 'narrow';

function seed() {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { eventId: trackingId, eventName: 'Tracking' },
      { eventId: narrowId, eventName: 'Narrow' },
    ],
    tournamentAttributes: { startDate, endDate },
    setState: true,
  });
  const result = tournamentEngine.setEventDates({ eventId: narrowId, startDate: '2025-06-04', endDate: '2025-06-06' });
  expect(result.success).toEqual(true);

  const modifiedEventIds: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_EVENT]: (notices) => notices.forEach(({ event }) => modifiedEventIds.push(event.eventId)),
    },
  });
  return { modifiedEventIds };
}

function eventRange(eventId: string) {
  const { event } = tournamentEngine.getEvent({ eventId });
  return [event.startDate, event.endDate];
}

afterEach(() => setSubscriptions({ subscriptions: {} }));

describe('setTournamentDates keeps event ranges inside the tournament range', () => {
  it('extend: a tracking event takes the new range; a narrow event is untouched', () => {
    const { modifiedEventIds } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-01', endDate: '2025-06-12' });
    expect(result.success).toEqual(true);

    expect(eventRange(trackingId)).toEqual(['2025-06-01', '2025-06-12']);
    expect(eventRange(narrowId)).toEqual(['2025-06-04', '2025-06-06']);
    expect(result.eventDateChanges).toEqual([
      {
        eventId: trackingId,
        reason: 'TRACKED',
        previousStartDate: startDate,
        previousEndDate: endDate,
        startDate: '2025-06-01',
        endDate: '2025-06-12',
      },
    ]);
    expect(modifiedEventIds).toEqual([trackingId]);
  });

  it('setTournamentEndDate alone extends a tracking event', () => {
    const { modifiedEventIds } = seed();
    let result: any = tournamentEngine.setTournamentEndDate({ endDate: '2025-06-10' });
    expect(result.success).toEqual(true);
    expect(eventRange(trackingId)).toEqual([startDate, '2025-06-10']);
    expect(eventRange(narrowId)).toEqual(['2025-06-04', '2025-06-06']);
    expect(modifiedEventIds).toEqual([trackingId]);
  });

  it('setTournamentStartDate alone extends a tracking event backwards', () => {
    seed();
    let result: any = tournamentEngine.setTournamentStartDate({ startDate: '2025-05-30' });
    expect(result.success).toEqual(true);
    expect(eventRange(trackingId)).toEqual(['2025-05-30', endDate]);
    expect(eventRange(narrowId)).toEqual(['2025-06-04', '2025-06-06']);
  });

  it('shrink: a tracking event follows; a narrow event is clamped to the overlap', () => {
    const { modifiedEventIds } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-05', endDate: '2025-06-07' });
    expect(result.success).toEqual(true);

    expect(eventRange(trackingId)).toEqual(['2025-06-05', '2025-06-07']);
    expect(eventRange(narrowId)).toEqual(['2025-06-05', '2025-06-06']);
    expect(result.eventDateChanges.map(({ eventId, reason }) => [eventId, reason])).toEqual([
      [trackingId, 'TRACKED'],
      [narrowId, 'CLAMPED'],
    ]);
    expect(modifiedEventIds.sort((a, b) => a.localeCompare(b))).toEqual([narrowId, trackingId]);
  });

  it('shift with overlap: a tracking event shifts; a narrow event keeps the part still inside', () => {
    seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-05', endDate: '2025-06-11' });
    expect(result.success).toEqual(true);
    expect(eventRange(trackingId)).toEqual(['2025-06-05', '2025-06-11']);
    expect(eventRange(narrowId)).toEqual(['2025-06-05', '2025-06-06']);
  });

  it('shift past a narrow range: the event is reset to the tournament range and reported', () => {
    const { modifiedEventIds } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-09', endDate: '2025-06-15' });
    expect(result.success).toEqual(true);

    expect(eventRange(trackingId)).toEqual(['2025-06-09', '2025-06-15']);
    expect(eventRange(narrowId)).toEqual(['2025-06-09', '2025-06-15']);
    const narrowChange = result.eventDateChanges.find(({ eventId }) => eventId === narrowId);
    expect(narrowChange).toEqual({
      eventId: narrowId,
      reason: 'RESET',
      previousStartDate: '2025-06-04',
      previousEndDate: '2025-06-06',
      startDate: '2025-06-09',
      endDate: '2025-06-15',
    });
    expect(modifiedEventIds.length).toEqual(2);
  });

  it('an event already outside the tournament range is reset by the next date change', () => {
    seed();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const stale = tournamentRecord.events.find(({ eventId }) => eventId === narrowId);
    stale.startDate = '2025-07-01';
    stale.endDate = '2025-07-03';
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentDates({ startDate, endDate: '2025-06-09' });
    expect(result.success).toEqual(true);
    expect(eventRange(narrowId)).toEqual([startDate, '2025-06-09']);
  });

  it('an unchanged range touches no event and sends no MODIFY_EVENT', () => {
    const { modifiedEventIds } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate, endDate });
    expect(result.success).toEqual(true);
    expect(result.eventDateChanges).toBeUndefined();
    expect(modifiedEventIds).toEqual([]);
  });

  it('a refused date change leaves every event range as it was', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      tournamentAttributes: { startDate, endDate },
      setState: true,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    let result: any = tournamentEngine.addMatchUpScheduledDate({
      matchUpId: matchUps[0].matchUpId,
      scheduledDate: endDate,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setTournamentDates({ startDate, endDate: '2025-06-05' });
    expect(result.error).toEqual(expect.objectContaining({ code: MATCHUPS_SCHEDULED_OUTSIDE_DATES.code }));
    expect(eventRange(eventId)).toEqual([startDate, endDate]);
  });
});
