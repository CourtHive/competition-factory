import { removeCourtAssignment } from '@Mutate/matchUps/schedule/removeCourtAssignment';
import { getScheduleTimes } from '@Query/venues/getScheduleTimes';
import { getMatchUpIds } from '@Functions/global/extractors';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ASSIGN_COURT, SCHEDULED_DATE, SCHEDULED_TIME, ASSIGN_VENUE, START_TIME } from '@Constants/timeItemConstants';
import { DELETE_VENUE, MODIFY_VENUE } from '@Constants/topicConstants';
import { SINGLES } from '@Constants/eventConstants';
import {
  MATCHUP_NOT_FOUND,
  MISSING_COURT_ID,
  MISSING_DRAW_ID,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VENUE_ID,
} from '@Constants/errorConditionConstants';

tournamentEngine.devContext({ addVenue: true });

// '2020-01-01' and '2020-01-01T00:00Z' work but '2020-01-01T00:00' does not work
const d200101 = '2020-01-01T00:00';

let venueModificationsCounter = 0;
let venueDeletionsCounter = 0;
setSubscriptions({
  subscriptions: {
    [MODIFY_VENUE]: () => {
      venueModificationsCounter += 1;
    },
    [DELETE_VENUE]: () => {
      venueDeletionsCounter += 1;
    },
  },
});

// this is necessary to ensure that at least one millisecond has passed between modifications
async function forceDelay(delay = 10) {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), delay));
}

it('can add events, venues, and schedule matchUps and modify drawDefinition.updatedAt', async () => {
  const startDate = '2020-01-01';
  const endDate = '2020-01-06';
  const participantsCount = 32;

  const { tournamentRecord: record } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    startDate,
    endDate,
  });
  const { participants } = record;
  tournamentEngine.setState(record);

  const event = {
    eventName: 'Test Event',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    automated: true,
    drawSize: 32,
    eventId,
    participants,
    event: eventResult,
  };
  let { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  const { drawId } = drawDefinition;
  let lastUpdatedAt = drawDefinition.updatedAt;

  await forceDelay();

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));

  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  const myCourts = { venueName: 'My Courts' };
  result = tournamentEngine.addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const dateAvailability = [
    {
      startTime: '07:00',
      endTime: '19:00',
      date: d200101,
      bookings: [
        { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
        { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
        { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
      ],
    },
  ];
  const courtIds = tournamentEngine.addCourts({
    dateAvailability,
    courtsCount: 3,
    venueId,
  }).courtIds;
  expect(courtIds.length).toEqual(3);

  result = tournamentEngine.getCourts();
  expect(result.courts.length).toEqual(3);

  let { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.venues.length).toEqual(1);

  const { upcomingMatchUps: upcoming, pendingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(upcoming.length).toEqual(16);
  expect(pendingMatchUps.length).toEqual(15);

  const timingParameters = {
    averageMatchUpMinutes: 90,
    courts: result.courts,
    startTime: '08:00',
    endTime: ' 19:00',
    periodLength: 30,
    date: d200101,
  };
  const { scheduleTimes } = getScheduleTimes(timingParameters);
  expect(scheduleTimes?.length).toEqual(18);

  ({ tournamentRecord } = tournamentEngine.getTournament());
  const tournamentId = tournamentRecord.unifiedTournamentId?.tournamentId || tournamentRecord.tournamentId;
  let tournamentRecords = { [tournamentId]: tournamentRecord };

  await forceDelay();

  const matchUpIds = getMatchUpIds(upcoming);
  result = tournamentEngine.setState(tournamentRecords).scheduleMatchUps({ scheduleDate: d200101, matchUpIds });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  ({ tournamentRecords } = tournamentEngine.getState());
  tournamentRecord = tournamentRecords[tournamentId];
  tournamentEngine.setState(tournamentRecord);

  let scheduledDate = d200101;
  let contextFilters: any = {
    drawIds: [drawId],
    structureIds: [],
    roundNumbers: [1],
    eventIds: [],
  };

  let { upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  });
  expect(upcomingMatchUps.length).toEqual(16);

  contextFilters = { scheduledDate: '2020-01-02T00:00' };
  ({ upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  }));
  expect(upcomingMatchUps.length).toEqual(0);

  const courtId = courtIds[0];

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let [matchUp] = matchUps;
  const { matchUpId } = matchUp;

  await forceDelay();

  result = tournamentEngine.assignMatchUpVenue({
    venueId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);

  result = tournamentEngine.assignMatchUpVenue({
    matchUpId,
    venueId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  result = tournamentEngine.assignMatchUpVenue({
    matchUpId,
    venueId: undefined,
    drawId,
  });
  expect(result.success).toEqual(true);

  let {
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  });
  expect(schedule.venueId).toBeUndefined();

  result = tournamentEngine.assignMatchUpVenue({
    matchUpId,
    venueId,
    drawId,
  });
  expect(result.success).toEqual(true);

  await forceDelay();

  result = tournamentEngine.assignMatchUpCourt({
    courtDayDate: scheduledDate,
    courtId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  result = tournamentEngine.assignMatchUpCourt({
    courtDayDate: scheduledDate,
    matchUpId,
    courtId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.assignMatchUpCourt({
    courtDayDate: scheduledDate,
    courtId: undefined,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }));
  expect(schedule.courtId).toBeUndefined();

  await forceDelay();

  result = tournamentEngine.assignMatchUpCourt({
    courtDayDate: scheduledDate,
    matchUpId,
    courtId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  await forceDelay();

  scheduledDate = '2020-01-03';
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  await forceDelay();

  const scheduledTime = '08:00';
  result = tournamentEngine.addMatchUpScheduledTime({
    scheduledTime,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  await forceDelay();

  const startTime = '08:00';
  result = tournamentEngine.addMatchUpStartTime({
    matchUpId,
    startTime,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  await forceDelay();

  const endTime = '14:30';
  result = tournamentEngine.addMatchUpEndTime({
    matchUpId,
    endTime,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  contextFilters = { courtIds };
  ({ matchUps } = tournamentEngine.allTournamentMatchUps({ contextFilters }));
  expect(matchUps.length).toEqual(1);

  matchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

  expect(matchUp.timeItems[0].itemType).toEqual(SCHEDULED_TIME);
  expect(matchUp.timeItems[1].itemType).toEqual(ASSIGN_VENUE);
  expect(matchUp.timeItems[2].itemType).toEqual(ASSIGN_VENUE);
  expect(matchUp.timeItems[3].itemType).toEqual(ASSIGN_VENUE);
  expect(matchUp.timeItems[4].itemType).toEqual(ASSIGN_COURT);
  expect(matchUp.timeItems[5].itemType).toEqual(ASSIGN_COURT);
  expect(matchUp.timeItems[6].itemType).toEqual(ASSIGN_COURT);
  expect(matchUp.timeItems[7].itemType).toEqual(SCHEDULED_DATE);
  expect(matchUp.timeItems[8].itemType).toEqual(SCHEDULED_TIME);
  expect(matchUp.timeItems[9].itemType).toEqual(START_TIME);

  ({ schedule } = matchUp);
  expect(schedule.courtId).toEqual(courtId);
  expect(schedule.venueId).toEqual(venueId);
  expect(schedule.scheduledTime).toEqual(scheduledTime);

  result = tournamentEngine.deleteCourt();
  expect(result.error).toEqual(MISSING_COURT_ID);
  result = tournamentEngine.getVenuesAndCourts();
  expect(result.success).toEqual(true);
  result = tournamentEngine.deleteCourt({ courtId });
  expect(result.error).not.toBeUndefined();
  expect(result.info).not.toBeUndefined();

  let { venues } = tournamentEngine.getVenuesAndCourts();
  expect(venues.length).toEqual(1);

  result = tournamentEngine.deleteVenue();
  expect(result.error).toEqual(MISSING_VENUE_ID);
  result = tournamentEngine.deleteVenue();
  expect(result.error).toEqual(MISSING_VENUE_ID);
  result = tournamentEngine.deleteVenue({ venueId: '12345' });
  expect(result.success).toEqual(true); // venue doesn't exist, so no error
  result = tournamentEngine.deleteVenue({ venueId: '12345' });
  expect(result.success).toEqual(true); // venue doesn't exist, so no error

  result = tournamentEngine.deleteVenue({ venueId });
  expect(result.success).toBeUndefined();
  expect(result.info).not.toBeUndefined();

  await forceDelay();

  result = tournamentEngine.deleteCourt({ courtId, force: true });
  expect(result.success).toEqual(true);
  expect(venueModificationsCounter).toEqual(2);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());
  lastUpdatedAt = drawDefinition.updatedAt;

  result = tournamentEngine.deleteVenue({ venueId, force: true });
  expect(result.success).toEqual(true);
  expect(venueDeletionsCounter).toEqual(1);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));

  // no change was made to the drawDefinition because courts have already been removed from matchUps
  expect(lastUpdatedAt).toEqual(drawDefinition.updatedAt);
  lastUpdatedAt = drawDefinition.updatedAt;

  ({ venues } = tournamentEngine.getVenuesAndCourts());
  expect(venues.length).toEqual(0);

  await forceDelay();

  result = tournamentEngine.addMatchUpScheduledTime({
    scheduledTime: undefined,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  expect(new Date(lastUpdatedAt).getTime()).toBeLessThan(new Date(drawDefinition.updatedAt).getTime());

  ({
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }));
  expect(schedule.scheduledTime).toBeUndefined();

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));

  // these are unit tests and therefore do not modify { updatedAt }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = removeCourtAssignment({ drawDefinition });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);
  result = removeCourtAssignment({ matchUpId });
  expect(result.error).toEqual(MISSING_DRAW_ID);
  result = removeCourtAssignment({ matchUpId, drawId });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  result = removeCourtAssignment({ drawDefinition, matchUpId: 'foo' });
  expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  result = removeCourtAssignment({ drawDefinition, matchUpId });
  expect(result.success).toEqual(true);
});

it('adds venueId to matchUp.schedule when court is assigned', () => {
  const startDate = '2020-01-01';
  const endDate = '2020-01-06';
  const participantsCount = 32;

  const { tournamentRecord: record } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    startDate,
    endDate,
  });
  const { participants } = record;
  tournamentEngine.setState(record);

  const event = {
    eventName: 'Test Event',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    event: eventResult,
    automated: true,
    drawSize: 32,
    participants,
    eventId,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  const { drawId } = drawDefinition;

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const myCourts = { venueName: 'My Courts' };
  result = tournamentEngine.addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const date = '2020-01-01T00:00Z';
  const dateAvailability = [
    {
      startTime: '07:00',
      endTime: '19:00',
      date,
      bookings: [
        { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
        { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
        { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
      ],
    },
  ];
  result = tournamentEngine.addCourts({
    dateAvailability,
    courtsCount: 3,
    venueId,
  });
  expect(result.success).toEqual(true);
  expect(result.courtIds.length).toEqual(3);

  const { courts } = tournamentEngine.getCourts();
  expect(courts.length).toEqual(3);

  let { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.venues.length).toEqual(1);

  const { upcomingMatchUps: upcoming, pendingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(upcoming.length).toEqual(16);
  expect(pendingMatchUps.length).toEqual(15);

  const timingParameters = {
    averageMatchUpMinutes: 90,
    startTime: '08:00',
    endTime: ' 19:00',
    periodLength: 30,
    courts,
    date,
  };
  const { scheduleTimes } = getScheduleTimes(timingParameters);
  expect(scheduleTimes?.length).toEqual(18);

  ({ tournamentRecord } = tournamentEngine.getTournament());
  const tournamentId = tournamentRecord.unifiedTournamentId?.tournamentId || tournamentRecord.tournamentId;
  let tournamentRecords = { [tournamentId]: tournamentRecord };

  const matchUpIds = getMatchUpIds(upcoming);
  result = tournamentEngine.setState(tournamentRecords).scheduleMatchUps({ scheduleDate: date, matchUpIds });
  expect(result.success).toEqual(true);

  ({ tournamentRecords } = tournamentEngine.getState());
  tournamentRecord = tournamentRecords[tournamentId];
  tournamentEngine.setState(tournamentRecord);

  const scheduledDate = d200101;
  let contextFilters: any = {
    drawIds: [drawId],
    structureIds: [],
    roundNumbers: [1],
    eventIds: [],
  };

  let { upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  });
  expect(upcomingMatchUps.length).toEqual(16);

  contextFilters = { scheduledDate: '2020-01-02T00:00' };
  ({ upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  }));
  expect(upcomingMatchUps.length).toEqual(0);

  const courtIds = courts.map((court) => court.courtId);
  const courtId = courtIds[0];

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const [matchUp] = matchUps;
  const { matchUpId } = matchUp;

  result = tournamentEngine.assignMatchUpCourt({
    courtDayDate: scheduledDate,
    tournamentRecord,
    matchUpId,
    courtId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const {
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  });
  expect(schedule.venueId).toEqual(venueId);
});
