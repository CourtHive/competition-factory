import { validDateAvailability } from '@Validators/validateDateAvailability';
import { validTimePeriod } from '@Validators/time';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_DATE, INVALID_TIME, INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Every scheduling write validates through the clock's canonical forms and stores them (scheduling-pipeline.md § 9.9):
 * a date is a calendar day, a time is HH:MM, and a form that converts unambiguously is stored converted.
 */

describe('court and venue availability', () => {
  it('stores availability in canonical form', () => {
    const result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2026-06-22T00:00:00Z',
          startTime: '8:00 AM',
          endTime: '21:00:00',
          bookings: [{ startTime: '1:00 PM', endTime: '14:00', bookingType: 'PRACTICE' }],
        },
        { startTime: '09:00', endTime: '20:00' },
      ],
    });
    expect(result.valid).toEqual(true);
    expect(result.canonicalAvailability).toEqual([
      {
        date: '2026-06-22',
        startTime: '08:00',
        endTime: '21:00',
        bookings: [{ startTime: '13:00', endTime: '14:00', bookingType: 'PRACTICE' }],
      },
      { startTime: '09:00', endTime: '20:00' },
    ]);
  });

  it('refuses a date that is not a calendar day and a time that is not a time', () => {
    let result: any = validDateAvailability({
      dateAvailability: [{ date: '2026-02-30', startTime: '08:00', endTime: '20:00' }],
    });
    expect(result.error).toEqual(INVALID_DATE);

    result = validDateAvailability({ dateAvailability: [{ startTime: '08:00', endTime: '24:00' }] });
    expect(result.error).toEqual(INVALID_TIME);

    // the same time in two forms is the same time
    result = validDateAvailability({ dateAvailability: [{ startTime: '08:00', endTime: '8:00 AM' }] });
    expect(result.error).toEqual(INVALID_TIME);
  });

  it('validTimePeriod compares canonical times', () => {
    expect(validTimePeriod({ startTime: '9:00', endTime: '10:00' })).toEqual(true);
    expect(validTimePeriod({ startTime: '11:00 AM', endTime: '1:00 PM' })).toEqual(true);
    expect(validTimePeriod({ startTime: '13:00', endTime: '1:00 AM' })).toEqual(false);
    expect(validTimePeriod({ startTime: '08:00', endTime: '23:60' })).toEqual(false);
    expect(validTimePeriod()).toEqual(false);
  });

  it('modifyCourtAvailability and venue writes store canonical values', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, venueId: 'venueId' }],
      startDate: '2026-06-22',
      endDate: '2026-06-24',
      setState: true,
    });
    const courtId = tournamentEngine.getVenuesAndCourts().courts[0].courtId;

    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: '2026-06-23', startTime: '7:30 AM', endTime: '19:00:00' }],
      courtId,
    });
    expect(result.success).toEqual(true);
    const courtOf = () => tournamentEngine.getVenuesAndCourts().courts.find((c) => c.courtId === courtId);
    let court = courtOf();
    expect(court.dateAvailability).toEqual([{ date: '2026-06-23', startTime: '07:30', endTime: '19:00' }]);

    result = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: '2026-06-31', startTime: '08:00', endTime: '19:00' }],
      courtId,
    });
    expect(result.error).toEqual(INVALID_DATE);
    court = courtOf();
    expect(court.dateAvailability[0].date).toEqual('2026-06-23');

    result = tournamentEngine.modifyVenue({
      modifications: {
        defaultStartTime: '8:00 AM',
        defaultEndTime: '9:00 PM',
        dateAvailability: [{ startTime: '8:00', endTime: '21:00:00' }],
      },
      venueId: 'venueId',
    });
    expect(result.success).toEqual(true);
    const venue = tournamentEngine.getVenuesAndCourts().venues.find((v) => v.venueId === 'venueId');
    expect([venue.defaultStartTime, venue.defaultEndTime]).toEqual(['08:00', '21:00']);
    expect(venue.dateAvailability).toEqual([{ startTime: '08:00', endTime: '21:00' }]);

    result = tournamentEngine.addVenue({
      venue: { venueName: 'Second', defaultStartTime: '7:00', defaultEndTime: '20:00:00' },
      returnDetails: true,
    });
    expect([result.venue.defaultStartTime, result.venue.defaultEndTime]).toEqual(['07:00', '20:00']);

    result = tournamentEngine.addVenue({
      venue: { venueName: 'Third', defaultStartTime: '07:00', defaultEndTime: '25:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('tournament and event dates', () => {
  it('refuses a date that is not a calendar day', () => {
    let result: any = tournamentEngine.newTournamentRecord({ startDate: '2026-02-30', endDate: '2026-03-02' });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.newTournamentRecord({ startDate: '2026-02-26', endDate: '2026-02-29' });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.newTournamentRecord({ activeDates: ['2026-02-27', '2026-02-29'] });
    expect(result.error).toEqual(INVALID_DATE);

    // 2028 is a leap year
    result = tournamentEngine.newTournamentRecord({ startDate: '2028-02-26', endDate: '2028-02-29' });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setTournamentDates({ endDate: '2028-02-30' });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.setTournamentDates({ activeDates: ['2028-02-27', '2028-02-30'] });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('refuses an event date that is not a calendar day', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventName: 'E' }],
      startDate: '2026-04-27',
      endDate: '2026-05-03',
      setState: true,
    });
    let result: any = tournamentEngine.setEventDates({ eventId, startDate: '2026-04-31' });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.setEventStartDate({ eventId, startDate: '2026-04-31' });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.setEventEndDate({ eventId, endDate: '2026-04-31' });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.setEventDates({ eventId, startDate: '2026-04-30', endDate: '2026-05-01' });
    expect(result.success).toEqual(true);
  });
});
