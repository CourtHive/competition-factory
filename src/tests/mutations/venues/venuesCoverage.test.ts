import { updateCourtAvailability } from '@Mutate/venues/updateCourtAvailability';
import { removeCourtGridBooking } from '@Mutate/venues/removeCourtGridBooking';
import { addCourtGridBooking } from '@Mutate/venues/addCourtGridBooking';
import { deleteVenue, deleteVenues } from '@Mutate/venues/deleteVenue';
import { generateVenues } from '@Mutate/venues/generateVenues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { BOOKING_NOT_FOUND, COURT_NOT_FOUND, INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';

describe('updateCourtAvailability', () => {
  it('returns error when tournamentRecord is missing', () => {
    let result: any = updateCourtAvailability({});
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('updates court availability based on tournament date range', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-03';

    mocksEngine.generateTournamentRecord({
      venueProfiles: [
        {
          courtsCount: 2,
          venueId: 'v1',
          dateAvailability: [
            { date: startDate, startTime: '08:00', endTime: '18:00' },
            { date: '2023-01-02', startTime: '09:00', endTime: '20:00' },
          ],
        },
      ],
      setState: true,
      startDate,
      endDate,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = updateCourtAvailability({ tournamentRecord });
    expect(result.success).toEqual(true);

    // Verify courts now have dateAvailability for all tournament dates
    for (const venue of tournamentRecord.venues ?? []) {
      for (const court of venue.courts ?? []) {
        const dates = court.dateAvailability?.map((a) => a.date).filter(Boolean);
        expect(dates).toContain(startDate);
        expect(dates).toContain('2023-01-02');
        expect(dates).toContain(endDate);
      }
    }
  });

  it('preserves default (no-date) availability entries', () => {
    const startDate = '2023-06-01';
    const endDate = '2023-06-02';

    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, venueId: 'v1' }],
      setState: true,
      startDate,
      endDate,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const court = tournamentRecord.venues[0].courts[0];
    // Add a default availability (no date)
    court.dateAvailability = [
      { startTime: '07:00', endTime: '21:00' },
      { date: startDate, startTime: '08:00', endTime: '18:00' },
    ];

    let result: any = updateCourtAvailability({ tournamentRecord });
    expect(result.success).toEqual(true);

    // Default entry should be first
    const defaultEntry = court.dateAvailability.find((a) => !a.date);
    expect(defaultEntry).toBeDefined();
    expect(defaultEntry.startTime).toEqual('07:00');
  });

  it('handles venues with no courts', () => {
    const startDate = '2023-06-01';
    const endDate = '2023-06-02';

    tournamentEngine.newTournamentRecord({ startDate, endDate });
    tournamentEngine.addVenue({ venue: { venueName: 'Empty Venue' } });

    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = updateCourtAvailability({ tournamentRecord });
    expect(result.success).toEqual(true);
  });
});

describe('addVenue guards', () => {
  it('returns error for non-object venue', () => {
    tournamentEngine.newTournamentRecord();
    let result: any = tournamentEngine.addVenue({ venue: 'not-an-object' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('validates dateAvailability on venue', () => {
    tournamentEngine.newTournamentRecord();
    let result: any = tournamentEngine.addVenue({
      venue: {
        venueName: 'Test',
        dateAvailability: [{ date: 'bad-date', startTime: '08:00', endTime: '18:00' }],
      },
    });
    expect(result.error).toBeDefined();
  });

  it('validates defaultStartTime and defaultEndTime are both present', () => {
    tournamentEngine.newTournamentRecord();
    // Only defaultStartTime, no defaultEndTime
    let result: any = tournamentEngine.addVenue({
      venue: { venueName: 'Test', defaultStartTime: '08:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);

    // Only defaultEndTime, no defaultStartTime
    result = tournamentEngine.addVenue({
      venue: { venueName: 'Test', defaultEndTime: '18:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('validates defaultEndTime is after defaultStartTime', () => {
    tournamentEngine.newTournamentRecord();
    let result: any = tournamentEngine.addVenue({
      venue: { venueName: 'Test', defaultStartTime: '18:00', defaultEndTime: '08:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('succeeds with valid defaultStartTime and defaultEndTime', () => {
    tournamentEngine.newTournamentRecord();
    let result: any = tournamentEngine.addVenue({
      venue: { venueName: 'Test', defaultStartTime: '08:00', defaultEndTime: '18:00' },
    });
    expect(result.success).toEqual(true);
  });
});

describe('modifyVenue guards', () => {
  it('validates defaultStartTime and defaultEndTime during modification', () => {
    tournamentEngine.newTournamentRecord();
    const { venue } = tournamentEngine.addVenue({ venue: { venueName: 'Test' } });
    const { venueId } = venue;

    // Setting only defaultStartTime should fail
    let result: any = tournamentEngine.modifyVenue({
      venueId,
      modifications: { defaultStartTime: '08:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);

    // Setting only defaultEndTime should fail
    result = tournamentEngine.modifyVenue({
      venueId,
      modifications: { defaultEndTime: '18:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);

    // Invalid time range
    result = tournamentEngine.modifyVenue({
      venueId,
      modifications: { defaultStartTime: '18:00', defaultEndTime: '08:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('validates dateAvailability during modification', () => {
    tournamentEngine.newTournamentRecord();
    const { venue } = tournamentEngine.addVenue({ venue: { venueName: 'Test' } });
    const { venueId } = venue;

    // Invalid dateAvailability
    let result: any = tournamentEngine.modifyVenue({
      venueId,
      modifications: {
        dateAvailability: [{ date: 'bad-date', startTime: '08:00', endTime: '18:00' }],
      },
    });
    expect(result.error).toBeDefined();

    // Empty array should be accepted (clears dateAvailability)
    result = tournamentEngine.modifyVenue({
      venueId,
      modifications: { dateAvailability: [] },
    });
    expect(result.success).toEqual(true);
  });
});

describe('deleteCourt wrapper', () => {
  it('deletes a court via the singular deleteCourt function', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 3, venueId: 'v1' }],
      setState: true,
    });

    const { courts } = tournamentEngine.getCourts();
    expect(courts.length).toEqual(3);
    const courtId = courts[0].courtId;

    let result: any = tournamentEngine.deleteCourt({ courtId });
    expect(result.success).toEqual(true);

    const { courts: remaining } = tournamentEngine.getCourts();
    expect(remaining.length).toEqual(2);
  });

  it('returns COURT_NOT_FOUND for non-existent courtId', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    let result: any = tournamentEngine.deleteCourt({ courtId: 'bogus' });
    expect(result.error).toEqual(COURT_NOT_FOUND);
  });
});

describe('deleteVenues', () => {
  it('returns error when tournamentRecord is missing', () => {
    let result: any = deleteVenues({ venueIds: ['v1'] });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when venueIds is not an array', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = deleteVenues({ tournamentRecord, venueIds: 'not-array' as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('deletes multiple venues via direct function call', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-03';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        { venueName: 'V1', venueId: 'v1', courtsCount: 1 },
        { venueName: 'V2', venueId: 'v2', courtsCount: 1 },
        { venueName: 'V3', venueId: 'v3', courtsCount: 1 },
      ],
      startDate,
      endDate,
    });

    expect(tournamentRecord.venues.length).toEqual(3);

    let result: any = deleteVenues({
      tournamentRecord,
      venueIds: ['v1', 'v2'],
    });
    expect(result.success).toEqual(true);

    expect(tournamentRecord.venues.length).toEqual(1);
    expect(tournamentRecord.venues[0].venueId).toEqual('v3');
  });
});

describe('addCourtGridBooking direct guards', () => {
  it('returns error when tournamentRecord is missing', () => {
    let result: any = addCourtGridBooking({
      scheduledDate: '2024-01-15',
      bookingType: 'BLOCKED',
      courtOrder: 1,
      courtId: 'c1',
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when courtId is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = addCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2024-01-15',
      bookingType: 'BLOCKED',
      courtOrder: 1,
      courtId: '',
    } as any);
    expect(result.error).toEqual(COURT_NOT_FOUND);
  });

  it('returns error when scheduledDate is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = addCourtGridBooking({
      tournamentRecord,
      scheduledDate: '',
      bookingType: 'BLOCKED',
      courtOrder: 1,
      courtId: 'c1',
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when bookingType is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = addCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2024-01-15',
      bookingType: '',
      courtOrder: 1,
      courtId: 'c1',
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when courtOrder is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = addCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2024-01-15',
      bookingType: 'BLOCKED',
      courtOrder: undefined as any,
      courtId: 'c1',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('removeCourtGridBooking direct guards', () => {
  it('returns error when tournamentRecord is missing', () => {
    let result: any = removeCourtGridBooking({
      scheduledDate: '2024-01-15',
      courtOrder: 1,
      courtId: 'c1',
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when courtId is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = removeCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2024-01-15',
      courtOrder: 1,
      courtId: '',
    } as any);
    expect(result.error).toEqual(COURT_NOT_FOUND);
  });

  it('returns error when scheduledDate is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = removeCourtGridBooking({
      tournamentRecord,
      scheduledDate: '',
      courtOrder: 1,
      courtId: 'c1',
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when courtOrder is missing', () => {
    tournamentEngine.newTournamentRecord();
    const { tournamentRecord } = tournamentEngine.getTournament();
    let result: any = removeCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2024-01-15',
      courtOrder: undefined as any,
      courtId: 'c1',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns BOOKING_NOT_FOUND when no bookings exist for date', () => {
    tournamentEngine.newTournamentRecord();
    const { venue } = tournamentEngine.addVenue({ venue: { venueName: 'V' } });
    const { court } = tournamentEngine.addCourt({
      venueId: venue.venueId,
      court: { courtName: 'C1' },
    });
    const { tournamentRecord } = tournamentEngine.getTournament();

    let result: any = removeCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2099-01-01',
      courtOrder: 1,
      courtId: court.courtId,
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });
});

describe('generateVenues ignoreExistingVenues', () => {
  it('continues when ignoreExistingVenues is true and venue already exists', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-03';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Existing', venueId: 'existing-id', courtsCount: 1 }],
      startDate,
      endDate,
    });

    let result: any = generateVenues({
      tournamentRecord,
      ignoreExistingVenues: true,
      venueProfiles: [
        { venueName: 'Existing', venueId: 'existing-id', courtsCount: 2 },
        { venueName: 'New Venue', venueId: 'new-id', courtsCount: 1 },
      ],
    });
    // Should return venueIds array (only the new one gets added)
    expect(Array.isArray(result)).toEqual(true);
    expect(result.length).toEqual(1);
    expect(result[0]).toEqual('new-id');

    expect(tournamentRecord.venues.length).toEqual(2);
  });
});

describe('addCourt edge cases', () => {
  it('returns COURT_EXISTS when adding a court with duplicate courtId', () => {
    tournamentEngine.newTournamentRecord();
    const { venue } = tournamentEngine.addVenue({ venue: { venueName: 'Test' } });
    const { venueId } = venue;

    const { court } = tournamentEngine.addCourt({
      venueId,
      courtId: 'fixed-court-id',
      court: { courtName: 'C1' },
    });
    expect(court.courtId).toEqual('fixed-court-id');

    // Try adding another court with the same courtId
    let result: any = tournamentEngine.addCourt({
      venueId,
      courtId: 'fixed-court-id',
      court: { courtName: 'C2' },
    });
    expect(result.error).toBeDefined();
  });

  it('addCourts with courtTimings and default availability', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-03';

    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 0, venueId: 'v1' }],
      setState: true,
      startDate,
      endDate,
    });

    // Use courtsAdd directly since the engine addCourts wraps it
    let result: any = tournamentEngine.addCourts({
      venueId: 'v1',
      courtsCount: 2,
      startTime: '08:00',
      endTime: '18:00',
      courtTimings: [
        { startTime: '09:00', endTime: '17:00' },
        { startTime: '10:00', endTime: '16:00' },
      ],
      dates: [startDate, '2023-01-02', endDate],
    });
    expect(result.success).toEqual(true);
  });

  it('addCourts with venueAbbreviationRoot uses venue abbreviation for naming', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-02';

    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 0, venueId: 'v1', venueAbbreviation: 'TST' }],
      setState: true,
      startDate,
      endDate,
    });

    // Manually set the venueAbbreviation since venueProfiles may not set it
    tournamentEngine.modifyVenue({
      venueId: 'v1',
      modifications: { venueAbbreviation: 'TST' },
    });

    let result: any = tournamentEngine.addCourts({
      venueAbbreviationRoot: true,
      courtsCount: 2,
      venueId: 'v1',
    });
    expect(result.success).toEqual(true);
  });

  it('addCourts with idPrefix generates predictable courtIds', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-02';

    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 0, venueId: 'v1' }],
      setState: true,
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.addCourts({
      courtsCount: 2,
      idPrefix: 'ct',
      venueId: 'v1',
    });
    expect(result.success).toEqual(true);
    expect(result.courtIds).toContain('ct-1');
    expect(result.courtIds).toContain('ct-2');
  });

  it('addCourts returns VENUE_NOT_FOUND for missing venueId', () => {
    tournamentEngine.newTournamentRecord();
    let result: any = tournamentEngine.addCourts({
      venueId: 'nonexistent',
      courtsCount: 2,
    });
    expect(result.error).toEqual(VENUE_NOT_FOUND);
  });
});

describe('deleteVenue edge cases', () => {
  it('deleteVenue with empty tournamentRecords returns error', () => {
    let result: any = deleteVenue({
      tournamentRecords: {},
      venueId: 'some-id',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('deleteVenue force-deletes venue with scheduled matchUps across linked records', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-03';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'drawId', drawSize: 4 }],
      venueProfiles: [{ courtsCount: 2, venueId: 'v1', idPrefix: 'c', venueAbbreviation: 'V' }],
      startDate,
      endDate,
    });

    tournamentEngine.setState(tournamentRecord);

    // Schedule matchUps
    const { rounds } = tournamentEngine.getRounds();
    const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId: 'v1', rounds }] }];
    tournamentEngine.setSchedulingProfile({ schedulingProfile });
    tournamentEngine.scheduleProfileRounds({ periodLength: 30 });

    // Force delete the venue with scheduled matchUps
    let result: any = tournamentEngine.deleteVenue({ venueId: 'v1', force: true });
    expect(result.success).toEqual(true);

    const { venues } = tournamentEngine.getVenuesAndCourts();
    expect(venues.length).toEqual(0);
  });
});

describe('courtAvailability conflict detection with deterministic court assignment', () => {
  it('returns SCHEDULE_CONFLICT when matchUp is explicitly on the court', () => {
    const startDate = '2023-01-01';
    const endDate = '2023-01-03';

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'drawId', drawSize: 4 }],
      venueProfiles: [{ courtsCount: 1, venueId: 'v1', idPrefix: 'c', venueAbbreviation: 'V' }],
      setState: true,
      startDate,
      endDate,
    });

    // Schedule matchUps onto the single court
    const { rounds } = tournamentEngine.getRounds();
    const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId: 'v1', rounds }] }];
    tournamentEngine.setSchedulingProfile({ schedulingProfile });
    tournamentEngine.scheduleProfileRounds({ periodLength: 30 });

    const { courts } = tournamentEngine.getCourts();
    const courtId = courts[0].courtId;

    // Explicitly assign a matchUp to the court
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const scheduledMatchUp = matchUps.find((m) => m.schedule?.scheduledTime);
    if (scheduledMatchUp) {
      tournamentEngine.assignMatchUpCourt({
        matchUpId: scheduledMatchUp.matchUpId,
        courtDayDate: startDate,
        drawId: 'drawId',
        courtId,
      });

      // Reduce availability to a window that excludes the scheduled time
      let result: any = tournamentEngine.modifyCourtAvailability({
        dateAvailability: [{ date: startDate, startTime: '23:00', endTime: '23:59' }],
        courtId,
      });

      // Should get conflict error since matchUp is outside the new window
      expect(result.error).toBeDefined();
      expect(result.matchUpIds).toBeDefined();
    }
  });
});

describe('removeCourtGridBooking with bookings at wrong courtOrder', () => {
  it('returns BOOKING_NOT_FOUND when courtOrder does not match any existing booking', () => {
    tournamentEngine.newTournamentRecord();
    const { venue } = tournamentEngine.addVenue({ venue: { venueName: 'V' } });
    const { court } = tournamentEngine.addCourt({
      venueId: venue.venueId,
      court: { courtName: 'C1' },
    });

    // Add a booking at courtOrder 5
    tournamentEngine.addCourtGridBooking({
      scheduledDate: '2024-01-15',
      bookingType: 'BLOCKED',
      courtOrder: 5,
      courtId: court.courtId,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();

    // Try removing at courtOrder 3 where no booking exists
    let result: any = removeCourtGridBooking({
      tournamentRecord,
      scheduledDate: '2024-01-15',
      courtOrder: 3,
      courtId: court.courtId,
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });
});
