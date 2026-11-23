import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_DATE, INVALID_VALUES, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';

// 2026-11-13 is a Friday; the tournament runs Fri 13 .. Mon 16
const startDate = '2026-11-13';
const endDate = '2026-11-16';

const drawIds: Record<string, string> = {};

function setup() {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { eventId: 'satEvent', eventName: 'Saturday', drawProfiles: [{ drawSize: 4 }] },
      { eventId: 'friEvent', eventName: 'Friday', drawProfiles: [{ drawSize: 4 }] },
    ],
    setState: true,
    startDate,
    endDate,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  for (const { matchUpId, drawId } of matchUps) drawIds[matchUpId] = drawId;
  const sat = matchUps.filter(({ eventId }) => eventId === 'satEvent').map(({ matchUpId }) => matchUpId);
  const fri = matchUps.filter(({ eventId }) => eventId === 'friEvent').map(({ matchUpId }) => matchUpId);
  return { sat, fri };
}

function scheduleOn(matchUpIds: string[], scheduledDate: string) {
  for (const matchUpId of matchUpIds) {
    const result = tournamentEngine.addMatchUpScheduleItems({
      drawId: drawIds[matchUpId],
      schedule: { scheduledDate },
      matchUpId,
    });
    expect(result.success).toEqual(true);
  }
}

it('reports per event the scheduled matchUps whose event does not play that day', () => {
  const { sat, fri } = setup();
  let result: any = tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT'] });
  expect(result.success).toEqual(true);
  result = tournamentEngine.setEventDates({ eventId: 'friEvent', weekdays: ['FRI'] });
  expect(result.success).toEqual(true);

  // both events on the Friday: only the Saturday event is out of place
  scheduleOn([...sat, ...fri], '2026-11-13');
  result = tournamentEngine.getEventDateIssues();
  expect(result.success).toEqual(true);
  expect(result.eventDateIssues.map(({ matchUpId }) => matchUpId).sort()).toEqual([...sat].sort());
  expect(result.eventDateIssues[0]).toEqual({
    tournamentId: tournamentEngine.getTournament().tournamentRecord.tournamentId,
    matchUpId: result.eventDateIssues[0].matchUpId,
    scheduledDate: '2026-11-13',
    reason: 'EVENT_WEEKDAY',
    eventId: 'satEvent',
  });

  // narrowed by date and by matchUpIds
  expect(tournamentEngine.getEventDateIssues({ scheduledDate: '2026-11-14' }).eventDateIssues).toEqual([]);
  expect(tournamentEngine.getEventDateIssues({ scheduledDate: '2026-11-13' }).eventDateIssues.length).toEqual(2);
  expect(tournamentEngine.getEventDateIssues({ matchUpIds: [sat[0], fri[0]] }).eventDateIssues.length).toEqual(1);
  expect(tournamentEngine.getEventDateIssues({ matchUpIds: fri }).eventDateIssues).toEqual([]);

  // the Saturday: now only the Friday event is out of place
  scheduleOn([...sat, ...fri], '2026-11-14');
  result = tournamentEngine.getEventDateIssues();
  expect(result.eventDateIssues.map(({ matchUpId }) => matchUpId).sort()).toEqual([...fri].sort());

  // activeDates win over weekdays: the Friday event plays only on the Saturday now
  tournamentEngine.setEventDates({ eventId: 'friEvent', activeDates: ['2026-11-14'] });
  expect(tournamentEngine.getEventDateIssues().eventDateIssues).toEqual([]);

  // clearing with [] means unset: the weekdays rule applies again
  tournamentEngine.setEventDates({ eventId: 'friEvent', activeDates: [] });
  expect(tournamentEngine.getEventDateIssues().eventDateIssues.length).toEqual(2);
});

it('agrees with the predicate for every reason, and reads a scheduledTime with no scheduledDate', () => {
  const { sat, fri } = setup();
  tournamentEngine.setEventDates({ eventId: 'satEvent', startDate: '2026-11-14', endDate: '2026-11-15' });
  scheduleOn([sat[0]], '2026-11-13');
  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledTime: '2026-11-16T10:00' },
    drawId: drawIds[sat[1]],
    matchUpId: sat[1],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEventDateIssues();
  const reasons = Object.fromEntries(result.eventDateIssues.map(({ matchUpId, reason }) => [matchUpId, reason]));
  expect(reasons).toEqual({ [sat[0]]: 'OUTSIDE_EVENT_DATES', [sat[1]]: 'OUTSIDE_EVENT_DATES' });

  // tournament active dates narrow every event
  tournamentEngine.setTournamentDates({ activeDates: ['2026-11-14', '2026-11-15'] });
  scheduleOn([fri[0]], '2026-11-16');
  result = tournamentEngine.getEventDateIssues({ matchUpIds: [fri[0]] });
  expect(result.eventDateIssues[0].reason).toEqual('TOURNAMENT_INACTIVE_DATE');
});

it('refuses invalid parameters', () => {
  setup();
  expect(tournamentEngine.getEventDateIssues({ scheduledDate: 'notADate' }).error).toEqual(INVALID_DATE);
  expect(tournamentEngine.getEventDateIssues({ matchUpIds: 'notAnArray' }).error).toEqual(INVALID_VALUES);
  const { getEventDateIssues } = tournamentEngine;
  expect(typeof getEventDateIssues).toEqual('function');
});

it('refuses without tournament records', async () => {
  const { getEventDateIssues } = await import('@Query/matchUps/scheduling/getEventDateIssues');
  expect(getEventDateIssues({ tournamentRecords: {} }).error).toEqual(MISSING_TOURNAMENT_RECORDS);
  expect(getEventDateIssues(undefined as any).error).toEqual(MISSING_TOURNAMENT_RECORDS);
});

it('getEventPlayingDates through the engine', () => {
  setup();
  let result: any = tournamentEngine.getEventPlayingDates({ eventId: 'satEvent' });
  expect(result).toEqual({
    playingDates: ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
    constrained: false,
    success: true,
  });
  tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT', 'SUN'] });
  result = tournamentEngine.getEventPlayingDates({ eventId: 'satEvent' });
  expect(result).toEqual({ playingDates: ['2026-11-14', '2026-11-15'], constrained: true, success: true });
});

it('getRounds honours active dates and weekdays, and carries playingDates for constrained events', () => {
  setup();
  tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT'] });

  let result: any = tournamentEngine.getRounds();
  const satRounds = result.rounds.filter(({ eventId }) => eventId === 'satEvent');
  const friRounds = result.rounds.filter(({ eventId }) => eventId === 'friEvent');
  expect(satRounds.length).toEqual(2);
  expect(satRounds.every(({ playingDates }) => playingDates?.join() === '2026-11-14')).toEqual(true);
  expect(friRounds.every(({ playingDates }) => playingDates === undefined)).toEqual(true);

  result = tournamentEngine.getRounds({ scheduleDate: '2026-11-13' });
  expect(result.rounds.every(({ eventId }) => eventId === 'friEvent')).toEqual(true);
  expect(result.rounds.length).toEqual(2);
  expect(result.excludedRounds.length).toEqual(2);

  result = tournamentEngine.getRounds({ scheduleDate: '2026-11-14' });
  expect(result.rounds.length).toEqual(4);

  // a stale event range is ignored rather than excluding every date
  const { tournamentRecord } = tournamentEngine.getTournament();
  const friEvent = tournamentRecord.events.find(({ eventId }) => eventId === 'friEvent');
  friEvent.startDate = '2026-11-20';
  friEvent.endDate = '2026-11-22';
  tournamentEngine.setState(tournamentRecord);
  result = tournamentEngine.getRounds({ scheduleDate: '2026-11-13' });
  expect(result.rounds.length).toEqual(2);
});

it('public payloads carry playingDates only for constrained events', () => {
  setup();
  tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT', 'SUN'] });

  const { eventInfo } = tournamentEngine.getTournamentInfo().tournamentInfo;
  const satInfo = eventInfo.find(({ eventId }) => eventId === 'satEvent');
  const friInfo = eventInfo.find(({ eventId }) => eventId === 'friEvent');
  expect(satInfo.playingDates).toEqual(['2026-11-14', '2026-11-15']);
  expect('playingDates' in friInfo && friInfo.playingDates !== undefined).toEqual(false);

  let result: any = tournamentEngine.getEventData({ eventId: 'satEvent' });
  expect(result.eventData.eventInfo.playingDates).toEqual(['2026-11-14', '2026-11-15']);
  result = tournamentEngine.getEventData({ eventId: 'friEvent' });
  expect('playingDates' in result.eventData.eventInfo).toEqual(false);

  result = tournamentEngine.getAllEventData();
  const satData = result.allEventData.eventsData.find(({ eventId }) => eventId === 'satEvent');
  expect(satData.playingDates).toEqual(['2026-11-14', '2026-11-15']);
});
