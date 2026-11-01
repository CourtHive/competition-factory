import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { EVENT_DATE_INACTIVE } from '@Constants/errorConditionConstants';

// 2026-11-13 is a Friday; the tournament runs Fri 13 .. Mon 16
const startDate = '2026-11-13';
const endDate = '2026-11-16';
const FRI = '2026-11-13';
const SAT = '2026-11-14';

function setup() {
  const {
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { eventId: 'satEvent', eventName: 'Saturday', drawProfiles: [{ drawSize: 4, drawId: 'satDraw' }] },
      { eventId: 'friEvent', eventName: 'Friday', drawProfiles: [{ drawSize: 4, drawId: 'friDraw' }] },
    ],
    venueProfiles: [{ courtsCount: 4 }],
    setState: true,
    startDate,
    endDate,
  });
  tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT'] });
  tournamentEngine.setEventDates({ eventId: 'friEvent', weekdays: ['FRI'] });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const sat = matchUps.filter(({ eventId }) => eventId === 'satEvent');
  const fri = matchUps.filter(({ eventId }) => eventId === 'friEvent');
  return { sat, fri, venueId };
}

const storedDate = (matchUpId: string) =>
  tournamentEngine.findMatchUp({ matchUpId, inContext: true }).matchUp.schedule.scheduledDate;

it('addMatchUpScheduledDate writes a non-playing day and warns, per event', () => {
  const { sat, fri } = setup();

  let result: any = tournamentEngine.addMatchUpScheduledDate({
    matchUpId: sat[0].matchUpId,
    drawId: sat[0].drawId,
    scheduledDate: FRI,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toEqual([
    {
      ...EVENT_DATE_INACTIVE,
      matchUpId: sat[0].matchUpId,
      eventId: 'satEvent',
      scheduledDate: FRI,
      reason: 'EVENT_WEEKDAY',
    },
  ]);
  expect(storedDate(sat[0].matchUpId)).toEqual(FRI);

  // the same day is a playing day for the other event: no warning
  result = tournamentEngine.addMatchUpScheduledDate({
    matchUpId: fri[0].matchUpId,
    drawId: fri[0].drawId,
    scheduledDate: FRI,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();

  // clearing warns about nothing
  result = tournamentEngine.addMatchUpScheduledDate({
    matchUpId: sat[0].matchUpId,
    drawId: sat[0].drawId,
    scheduledDate: '',
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
});

it('addMatchUpScheduledTime warns when its date-time gives the matchUp a non-playing day', () => {
  const { sat } = setup();
  let result: any = tournamentEngine.addMatchUpScheduledTime({
    matchUpId: sat[0].matchUpId,
    scheduledTime: `${FRI}T10:00`,
    drawId: sat[0].drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings?.map(({ code, reason }) => [code, reason])).toEqual([
    [EVENT_DATE_INACTIVE.code, 'EVENT_WEEKDAY'],
  ]);
  expect(storedDate(sat[0].matchUpId)).toEqual(FRI);

  // a time alone on a matchUp that already has its day says nothing more
  result = tournamentEngine.addMatchUpScheduledTime({
    matchUpId: sat[0].matchUpId,
    drawId: sat[0].drawId,
    scheduledTime: '11:00',
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
});

it('addSchedulingProfileRound adds a round on a non-playing day and warns', () => {
  const { venueId } = setup();
  const { tournamentId } = tournamentEngine.getTournament().tournamentRecord;
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'satDraw' });
  const structureId = drawDefinition.structures[0].structureId;
  const round = { tournamentId, eventId: 'satEvent', drawId: 'satDraw', structureId, roundNumber: 1 };

  let result: any = tournamentEngine.addSchedulingProfileRound({ scheduleDate: FRI, venueId, round });
  expect(result.success).toEqual(true);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({
    ...EVENT_DATE_INACTIVE,
    eventId: 'satEvent',
    scheduledDate: FRI,
    reason: 'EVENT_WEEKDAY',
  });
  expect(result.warnings[0].roundKey).toContain('satDraw');
  expect(tournamentEngine.getSchedulingProfile().schedulingProfile[0].venues[0].rounds).toHaveLength(1);

  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: SAT,
    venueId,
    round: { ...round, roundNumber: 2 },
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();

  // getSchedulingProfileIssues reports the profiled round on the non-playing day
  result = tournamentEngine.getSchedulingProfileIssues();
  expect(result.success).toEqual(true);
  expect(Object.keys(result.eventDateIssues)).toEqual([FRI]);
  expect(result.eventDateIssues[FRI]).toEqual([
    { roundKey: expect.stringContaining('satDraw'), eventId: 'satEvent', reason: 'EVENT_WEEKDAY' },
  ]);
  expect(tournamentEngine.getSchedulingProfileIssues({ scheduleDates: [SAT] }).eventDateIssues).toEqual({});

  // a later date edit makes the Saturday round stale too, and frees the Friday one
  tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['FRI'] });
  result = tournamentEngine.getSchedulingProfileIssues();
  expect(Object.keys(result.eventDateIssues)).toEqual([SAT]);
});

it('getSchedulingProfileIssues reports no event date issues without a profile', () => {
  setup();
  const result: any = tournamentEngine.getSchedulingProfileIssues();
  expect(result.eventDateIssues).toEqual({});
});

it('setEventDates and modifyEvent land and warn about scheduled matchUps on now non-playing days', () => {
  const { sat } = setup();
  for (const { matchUpId, drawId } of sat) {
    const result = tournamentEngine.addMatchUpScheduledDate({ matchUpId, drawId, scheduledDate: SAT });
    expect(result.warnings).toBeUndefined();
  }

  let result: any = tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SUN'] });
  expect(result.success).toEqual(true);
  expect(tournamentEngine.getEvent({ eventId: 'satEvent' }).event.weekdays).toEqual(['SUN']);
  expect(result.warnings.map(({ matchUpId }) => matchUpId).sort()).toEqual(
    sat.map(({ matchUpId }) => matchUpId).sort(),
  );
  expect(result.warnings[0]).toMatchObject({
    ...EVENT_DATE_INACTIVE,
    eventId: 'satEvent',
    scheduledDate: SAT,
    reason: 'EVENT_WEEKDAY',
  });

  // putting the Saturday back clears them
  result = tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT', 'SUN'] });
  expect(result).toEqual({ success: true });

  // a range edit through modifyEvent that excludes the Saturday warns too
  result = tournamentEngine.modifyEvent({ eventId: 'satEvent', eventUpdates: { startDate: '2026-11-15', endDate } });
  expect(result.success).toEqual(true);
  expect(result.warnings).toHaveLength(sat.length);
  expect(result.warnings[0].reason).toEqual('OUTSIDE_EVENT_DATES');

  result = tournamentEngine.modifyEvent({ eventId: 'satEvent', eventUpdates: { startDate, endDate } });
  expect(result).toEqual({ success: true });
});

it('addMatchUpScheduleItems writes a non-playing day and warns; validateOnly warns too; a court edit is quiet', () => {
  const { sat, fri, venueId } = setup();
  const { matchUpId, drawId } = sat[0];

  // validateOnly is the internal write check; through the engine the write itself is asked
  let result: any = tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { scheduledDate: FRI } });
  expect(result.success).toEqual(true);
  expect(result.warnings).toEqual([
    { ...EVENT_DATE_INACTIVE, matchUpId, eventId: 'satEvent', scheduledDate: FRI, reason: 'EVENT_WEEKDAY' },
  ]);
  expect(storedDate(matchUpId)).toEqual(FRI);

  // a date-time with no date: its date is the day judged
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledTime: `${FRI}T09:00` },
    matchUpId: sat[1].matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings?.map(({ code, matchUpId }) => [code, matchUpId])).toEqual([
    [EVENT_DATE_INACTIVE.code, sat[1].matchUpId],
  ]);

  // a court or a time alone sets no date: quiet
  const { courts } = tournamentEngine.getVenuesAndCourts();
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { venueId, courtId: courts[0].courtId },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
  result = tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { scheduledTime: '10:00' } });
  expect(result.warnings).toBeUndefined();

  // a playing day for its event: quiet
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: FRI },
    matchUpId: fri[0].matchUpId,
    drawId: fri[0].drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
});

it('validateOnly returns the warning without writing', async () => {
  const { sat } = setup();
  const { addMatchUpScheduleItems } = await import('@Mutate/matchUps/schedule/scheduleItems/scheduleItems');
  const { tournamentRecord } = tournamentEngine.getTournament();
  const event = tournamentRecord.events.find(({ eventId }) => eventId === 'satEvent');
  const drawDefinition = event.drawDefinitions[0];
  const result: any = addMatchUpScheduleItems({
    schedule: { scheduledDate: FRI },
    matchUpId: sat[0].matchUpId,
    validateOnly: true,
    tournamentRecord,
    drawDefinition,
    event,
  });
  expect(result.success).toEqual(true);
  expect(result.warnings?.[0]).toMatchObject({ ...EVENT_DATE_INACTIVE, reason: 'EVENT_WEEKDAY' });
  expect(storedDate(sat[0].matchUpId)).toBeUndefined();
});

it('the bulk paths aggregate the warning, each with its matchUpId', () => {
  const { sat, fri } = setup();
  const satIds = sat.map(({ matchUpId }) => matchUpId).sort();

  let result: any = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [...sat, ...fri].map(({ matchUpId }) => ({ matchUpId, schedule: { scheduledDate: FRI } })),
  });
  expect(result.success).toEqual(true);
  let warned = result.warnings.filter(({ code }) => code === EVENT_DATE_INACTIVE.code);
  expect(warned.map(({ matchUpId }) => matchUpId).sort()).toEqual(satIds);

  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds: sat.map(({ matchUpId }) => matchUpId),
    schedule: { scheduledDate: '2026-11-15' },
  });
  expect(result.success).toEqual(true);
  warned = result.warnings.filter(({ code }) => code === EVENT_DATE_INACTIVE.code);
  expect(warned.map(({ matchUpId }) => matchUpId).sort()).toEqual(satIds);

  // a day's shift moves the Friday event onto the Saturday, which it does not play
  result = tournamentEngine.bulkRescheduleMatchUps({
    matchUpIds: fri.map(({ matchUpId }) => matchUpId),
    scheduleChange: { daysChange: 1 },
  });
  expect(result.success).toEqual(true);
  warned = result.warnings.filter(({ code }) => code === EVENT_DATE_INACTIVE.code);
  expect(warned.map(({ matchUpId }) => matchUpId).sort()).toEqual(fri.map(({ matchUpId }) => matchUpId).sort());
  expect(warned[0]).toMatchObject({ scheduledDate: SAT, eventId: 'friEvent', reason: 'EVENT_WEEKDAY' });
});
