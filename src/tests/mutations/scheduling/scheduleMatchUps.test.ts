import { setSubscriptions } from '@Global/state/globalState';
import { legacyMode } from '@Tests/testHarness/legacyMode';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ASSIGN_COURT, END_TIME, RESUME_TIME, START_TIME, STOP_TIME } from '@Constants/timeItemConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { OFFICIAL } from '@Constants/participantRoles';
import {
  COURT_NOT_FOUND,
  INVALID_END_TIME,
  INVALID_RESUME_TIME,
  INVALID_START_TIME,
  INVALID_STOP_TIME,
  INVALID_TIME,
  INVALID_VALUES,
  MATCHUPS_SCHEDULED_OUTSIDE_DATES,
  MISSING_MATCHUP_ID,
  MISSING_PARTICIPANT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// asserts legacy timeItem counts for scheduling; NATIVE first-class schedule storage is covered by
// scheduleFirstClassStorage.test.ts
legacyMode('scheduleMatchUps — legacy timeItems', () => {
  it('can add events, venues, and schedule matchUps', () => {
    let startDate = '2020-01-01';
    const endDate = '2020-01-06';

    const drawProfiles = [{ drawSize: 32 }];
    const dateAvailability = [
      {
        date: startDate,
        startTime: '07:00',
        endTime: '19:00',
        bookings: [
          { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
          { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
          { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
        ],
      },
    ];
    const venueProfiles = [
      {
        venueName: 'venue 1',
        startTime: '08:00',
        endTime: '20:00',
        courtsCount: 3,
        dateAvailability,
      },
    ];
    const {
      drawIds: [drawId],
      venueIds: [venueId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      venueProfiles,
      drawProfiles,
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { tournamentId } = tournamentRecord;

    const participant = {
      participantRole: OFFICIAL,
      participantType: INDIVIDUAL,
      person: {
        standardFamilyName: 'Family',
        standardGivenName: 'Given',
        extensions: [{ name: 'someExtension', value: 'extensionValue' }],
      },
      extensions: [{ name: 'anotherExtension', value: 'anotherExtensionValue' }],
    };

    result = tournamentEngine.addParticipant({
      tournamentId: 'bogusId',
      participant,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    result = tournamentEngine.addParticipant({
      returnParticipant: true,
      tournamentId,
      participant,
    });
    expect(result.success).toEqual(true);
    const officialParticipantId = result.participant.participantId;

    const { courts, venues } = tournamentEngine.getVenuesAndCourts();
    expect(courts.length).toEqual(3);
    expect(venues.length).toEqual(1);

    const { upcomingMatchUps: upcoming, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    expect(upcoming.length).toEqual(16);
    expect(pendingMatchUps.length).toEqual(15);

    const courtIds = courts.map((court) => court.courtId);
    const courtId = courtIds[0];
    const [matchUp] = upcoming;
    const { matchUpId } = matchUp;

    result = tournamentEngine.assignMatchUpVenue({
      tournamentId,
      matchUpId,
      venueId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.assignMatchUpVenue({
      venueId: undefined,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.assignMatchUpCourt({
      courtDayDate: startDate,
      courtId: 'bogusId',
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(COURT_NOT_FOUND);

    result = tournamentEngine.assignMatchUpCourt({
      courtDayDate: startDate,
      tournamentId,
      matchUpId,
      courtId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.assignMatchUpCourt({
      courtDayDate: startDate,
      courtId: undefined,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addMatchUpScheduledDate({
      scheduledDate: startDate,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const scheduledTime = '08:00';
    result = tournamentEngine.addMatchUpScheduledTime({
      scheduledTime,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const startTime = '08:00';
    result = tournamentEngine.addMatchUpStartTime({
      tournamentId,
      startTime,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const stopTime = `08:15`;
    result = tournamentEngine.addMatchUpStopTime({
      tournamentId,
      stopTime,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const resumeTime = '14:30';
    result = tournamentEngine.addMatchUpResumeTime({
      tournamentId,
      resumeTime,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const endTime = '15:45';
    result = tournamentEngine.addMatchUpEndTime({
      tournamentId,
      matchUpId,
      endTime,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addMatchUpOfficial({
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

    result = tournamentEngine.addMatchUpOfficial({
      participantId: 'bogusId',
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

    result = tournamentEngine.addMatchUpOfficial({
      participantId: officialParticipantId,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    let { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    expect(upcomingMatchUps[0].timeItems.length).toEqual(12);

    result = tournamentEngine.addMatchUpCourtOrder({
      courtOrder: 'not numeric',
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);

    result = tournamentEngine.addMatchUpCourtOrder({
      courtOrder: 1,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());
    expect(upcomingMatchUps[0].timeItems.length).toEqual(13);
    expect(upcomingMatchUps[0].schedule.courtOrder).toEqual(1);

    const matchUpModifyNotices: any[] = [];
    const subscriptions = {
      modifyMatchUp: (payload) => {
        if (Array.isArray(payload)) {
          payload.forEach(({ matchUp }) => {
            matchUpModifyNotices.push(matchUp);
          });
        }
      },
    };

    setSubscriptions({ subscriptions });

    result = tournamentEngine.matchUpScheduleChange();
    expect(result.error).toEqual(MISSING_VALUE);

    result = tournamentEngine.matchUpScheduleChange({
      sourceMatchUpContextIds: { drawId, matchUpId, tournamentId },
    });
    expect(result.error).toEqual(MISSING_VALUE);

    result = tournamentEngine.matchUpScheduleChange({
      sourceMatchUpContextIds: { drawId, matchUpId, tournamentId },
      targetCourtId: courtId,
    });
    expect(result.success).toEqual(true);

    expect(matchUpModifyNotices.length).toEqual(1);

    ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());
    expect(upcomingMatchUps[0].timeItems.length).toEqual(14);

    // duplicating the modification does NOT add a new timeItem
    result = tournamentEngine.matchUpScheduleChange({
      sourceMatchUpContextIds: { drawId, matchUpId, tournamentId },
      targetCourtId: courtId,
    });
    expect(result.success).toEqual(true);
    expect(matchUpModifyNotices.length).toEqual(2);

    ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());
    expect(upcomingMatchUps[0].timeItems.length).toEqual(14);

    result = tournamentEngine.assignMatchUpCourt({
      tournamentId,
      matchUpId: upcoming[1].matchUpId,
      courtId: courts[1].courtId,
      drawId,
      courtDayDate: startDate,
    });
    expect(result.success).toEqual(true);
    expect(matchUpModifyNotices.length).toEqual(3);

    result = tournamentEngine.matchUpScheduleChange({
      sourceMatchUpContextIds: { drawId, matchUpId, tournamentId },
      targetMatchUpContextIds: {
        matchUpId: upcoming[1].matchUpId,
        tournamentId,
        drawId,
      },
      targetCourtId: courts[1].courtId,
      sourceCourtId: courtId,
    });
    expect(result.success).toEqual(true);
    // in this case two notices have been genrated
    expect(matchUpModifyNotices.length).toEqual(5);

    ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());
    expect(upcomingMatchUps[0].timeItems.length).toEqual(15);

    result = tournamentEngine.removeMatchUpCourtAssignment({
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());
    expect(upcomingMatchUps[0].timeItems.length).toEqual(16);

    result = tournamentEngine.addMatchUpScheduleItems({
      tournamentId,
      drawId,
      schedule: {
        scheduledDate: startDate,
      },
    });
    expect(result.error).toEqual(MISSING_MATCHUP_ID);

    result = tournamentEngine.addMatchUpScheduleItems({
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);

    // moving the start date past a scheduled matchUp is blocked (not silently unscheduled)
    startDate = '2020-01-02';
    result = tournamentEngine.setTournamentStartDate({ startDate });
    expect(result.error.code).toEqual(MATCHUPS_SCHEDULED_OUTSIDE_DATES.code);
    expect(result.outOfRangeMatchUpIds.length).toEqual(1);
    result = tournamentEngine.getTournamentInfo();
    expect(result.tournamentInfo.startDate).not.toEqual(startDate);
  });

  it('can schedule many attributes at once', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    const matchUpModifyNotices: any[] = [];
    const subscriptions = {
      modifyMatchUp: (payload) => {
        if (Array.isArray(payload)) {
          payload.forEach(({ matchUp }) => {
            matchUpModifyNotices.push(matchUp);
          });
        }
      },
    };
    setSubscriptions({ subscriptions });

    let { tournamentId, drawId, matchUpId } = matchUps[0];
    let result = tournamentEngine.addMatchUpScheduleItems({
      tournamentId,
      matchUpId,
      drawId,
      schedule: {
        scheduledTime: '08:00',
        startTime: '08:15',
        stopTime: '08:20',
        resumeTime: '08:35',
        endTime: '10:15',
      },
    });
    expect(result.success).toEqual(true);
    expect(matchUpModifyNotices.length).toEqual(1);

    const modifiedMatchUpId = matchUpId;

    const modifiedMatchUp = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { matchUpIds: [modifiedMatchUpId] },
    }).matchUps[0];
    expect(modifiedMatchUp.timeItems.length).toEqual(5);

    ({ tournamentId, drawId, matchUpId } = matchUps[1]);

    result = tournamentEngine.addMatchUpEndTime({
      endTime: '10:00',
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addMatchUpStartTime({
      endTime: '12:00',
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_START_TIME);

    matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [modifiedMatchUpId] },
    }).matchUps;
    expect(matchUps[0].timeItems.length).toEqual(5);

    result = tournamentEngine.clearMatchUpSchedule({
      scheduleAttributes: [ASSIGN_COURT, RESUME_TIME, STOP_TIME, START_TIME, END_TIME],
      matchUpId: modifiedMatchUpId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [modifiedMatchUpId] },
    }).matchUps;
    expect(matchUps[0].timeItems.length).toEqual(1);

    result = tournamentEngine.clearMatchUpSchedule({
      matchUpId: modifiedMatchUpId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [modifiedMatchUpId] },
    }).matchUps;
    expect(matchUps[0].timeItems).toBeUndefined();
  });

  const scheduleItems = [
    { scheduledTime: '24:00' },
    { startTime: '24:00' },
    { endTime: '24:00' },
    { stopTime: '24:00' },
    { resumeTime: '24:00' },
  ];

  it.each(scheduleItems)('throws errors for invalid time', (scheduleItem) => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    const { tournamentId, drawId, matchUpId } = matchUps[0];
    const result = tournamentEngine.addMatchUpScheduleItems({
      schedule: scheduleItem,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_TIME);
  });

  const scheduleScenarios = [
    {
      schedule: { startTime: '09:00', resumeTime: '08:00' },
      error: INVALID_RESUME_TIME,
    },
    {
      schedule: { startTime: '09:00', stopTime: '08:00' },
      error: INVALID_STOP_TIME,
    },
    {
      schedule: { startTime: '09:00', endTime: '08:00' },
      error: INVALID_END_TIME,
    },
  ];

  it.each(scheduleScenarios)('can schedule many attributes at once', (scheduleScenario) => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    const { tournamentId, drawId, matchUpId } = matchUps[0];
    const { schedule, error } = scheduleScenario;

    const result = tournamentEngine.addMatchUpScheduleItems({
      tournamentId,
      matchUpId,
      schedule,
      drawId,
    });
    expect(result.error).toEqual(error);
  });
});
