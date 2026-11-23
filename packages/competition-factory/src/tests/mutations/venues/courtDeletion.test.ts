import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractTime } from '@Tools/dateTime';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { SINGLES } from '@Constants/eventConstants';

it('can add events, venues, and schedule matchUps', () => {
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
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  const { drawId } = drawDefinition;

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const myCourts = { venueName: 'My Courts' };
  result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const date = '2020-01-01T00:00';
  const dateAvailability = [
    {
      date,
      startTime: '07:00',
      endTime: '19:00',
    },
  ];
  const { courtIds } = tournamentEngine.addCourts({
    dateAvailability,
    courtsCount: 3,
    venueId,
  });
  expect(courtIds.length).toEqual(3);

  const { courts } = tournamentEngine.getCourts();
  expect(courts.length).toEqual(3);

  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.venues.length).toEqual(1);

  const { upcomingMatchUps: upcoming, pendingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(upcoming.length).toEqual(16);
  expect(pendingMatchUps.length).toEqual(15);

  let scheduledDate = startDate;
  let contextFilters: any = {
    drawIds: [drawId],
    roundNumbers: [1],
    structureIds: [],
    eventIds: [],
  };

  let { upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  });
  expect(upcomingMatchUps.length).toEqual(16);

  contextFilters = { scheduledDate: '2020-01-02' };
  ({ upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  }));
  expect(upcomingMatchUps.length).toEqual(0);

  const courtId = courtIds[0];

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const [{ matchUpId }] = matchUps;

  result = tournamentEngine.assignMatchUpVenue({
    matchUpId,
    venueId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.assignMatchUpCourt({
    courtDayDate: scheduledDate,
    matchUpId,
    courtId,
    drawId,
  });
  expect(result.success).toEqual(true);

  scheduledDate = '2020-01-03T00:00'; // time component will be stripped away
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const scheduledTime = '2020-01-03T13:00'; // date component will be stripped away
  result = tournamentEngine.addMatchUpScheduledTime({
    scheduledTime,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  contextFilters = { courtIds };
  ({ matchUps } = tournamentEngine.allTournamentMatchUps({ contextFilters }));
  expect(matchUps.length).toEqual(1);
  expect(matchUps[0].schedule.courtId).toEqual(courtId);
  expect(matchUps[0].schedule.scheduledDate).toEqual(
    scheduledDate.split('T')[0], // time component was stripped
  );
  expect(matchUps[0].schedule.scheduledTime).toEqual(extractTime(scheduledTime));

  const venueName = 'New venue name';
  const venueAbbreviation = 'NVN';
  const modifications = {
    venueName,
    venueAbbreviation,
    courts: [
      {
        courtId: 'b9df6177-e430-4a70-ba47-9b9ff60258cb',
        courtName: 'Custom Court 1',
        dateAvailability: [
          {
            date: '2020-01-01',
            startTime: '16:30',
            endTime: '17:30',
          },
          {
            date: '2020-01-02',
            startTime: '16:30',
            endTime: '17:30',
          },
        ],
      },
    ],
  };

  result = tournamentEngine.modifyVenue({ venueId, modifications });
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.modifyVenue({
    modifications,
    force: true,
    venueId,
  });
  expect(result.success).toEqual(true);

  const remainingCourtIds = tournamentEngine.findVenue({ venueId }).venue.courts.map(xa('courtId'));
  expect(remainingCourtIds.includes(courtId)).toEqual(false);

  const matchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [matchUpId] },
  }).matchUps[0];
  expect(matchUp.schedule.courtId).toBeUndefined();
});
