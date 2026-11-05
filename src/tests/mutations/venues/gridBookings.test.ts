import { getGridBookings } from '@Helpers/scheduling/getGridBookings';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { BLOCKED, PRACTICE, MAINTENANCE } from '@Constants/scheduleConstants';
import {
  BOOKING_NOT_FOUND,
  COURT_NOT_FOUND,
  EXISTING_MATCHUPS,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

describe('Grid Bookings', () => {
  describe('getGridBookings', () => {
    it('can separate grid bookings from time bookings', () => {
      const result = tournamentEngine.newTournamentRecord();
      expect(result.success).toEqual(true);

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      // Add court with time-based bookings only
      const dateAvailability = [
        {
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '20:00',
          bookings: [
            // Time-based bookings
            { startTime: '07:00', endTime: '08:30', bookingType: PRACTICE },
            { startTime: '13:30', endTime: '14:00', bookingType: MAINTENANCE },
          ],
        },
      ];

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1', dateAvailability },
      });

      // Add grid bookings separately
      tournamentEngine.addCourtGridBooking({
        courtId,
        scheduledDate: '2024-01-15',
        courtOrder: 1,
        rowCount: 1,
        bookingType: BLOCKED,
      });
      tournamentEngine.addCourtGridBooking({
        courtId,
        scheduledDate: '2024-01-15',
        courtOrder: 3,
        rowCount: 2,
        bookingType: MAINTENANCE,
      });

      const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
      const court = foundVenue.courts.find((c) => c.courtId === courtId);

      const { gridBookings, timeBookings } = getGridBookings({
        court,
        date: '2024-01-15',
      });

      // Should have 3 grid booking entries (row 1 and rows 3-4)
      expect(gridBookings.size).toEqual(3);
      expect(gridBookings.has(1)).toEqual(true);
      expect(gridBookings.has(3)).toEqual(true);
      expect(gridBookings.has(4)).toEqual(true); // Part of rowCount: 2

      // Should have 2 time bookings
      expect(timeBookings.length).toEqual(2);
      expect(timeBookings[0].startTime).toEqual('07:00');
      expect(timeBookings[1].startTime).toEqual('13:30');
    });

    it('handles courts with no bookings', () => {
      const result = tournamentEngine.newTournamentRecord();
      expect(result.success).toEqual(true);

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
      const court = foundVenue.courts.find((c) => c.courtId === courtId);

      const { gridBookings, timeBookings } = getGridBookings({
        court,
        date: '2024-01-15',
      });

      expect(gridBookings.size).toEqual(0);
      expect(timeBookings.length).toEqual(0);
    });

    it('handles multiple consecutive rows correctly', () => {
      const result = tournamentEngine.newTournamentRecord();
      expect(result.success).toEqual(true);

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      // Add grid booking that spans multiple rows
      tournamentEngine.addCourtGridBooking({
        courtId,
        scheduledDate: '2024-01-15',
        courtOrder: 5,
        rowCount: 3,
        bookingType: BLOCKED,
      });

      const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
      const court = foundVenue.courts.find((c) => c.courtId === courtId);

      const { gridBookings } = getGridBookings({
        court,
        date: '2024-01-15',
      });

      expect(gridBookings.size).toEqual(3);
      expect(gridBookings.has(5)).toEqual(true);
      expect(gridBookings.has(6)).toEqual(true);
      expect(gridBookings.has(7)).toEqual(true);

      // All should reference the same booking
      const booking5 = gridBookings.get(5);
      const booking6 = gridBookings.get(6);
      expect(booking5).toBe(booking6); // Same object reference
    });
  });

  describe('addCourtGridBooking', () => {
    it('can add a grid booking to a court', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      const result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: PRACTICE,
        courtOrder: 2,
        courtId,
      });

      expect(result.success).toEqual(true);
      expect(result.booking).toBeDefined();
      expect(result.booking.courtOrder).toEqual(2);
      expect(result.booking.rowCount).toEqual(1);
      expect(result.booking.bookingType).toEqual(PRACTICE);
    });

    it('can add a booking blocking multiple consecutive rows', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      const result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: MAINTENANCE,
        courtOrder: 3,
        rowCount: 3,
        courtId,
        notes: 'Court resurfacing',
      });

      expect(result.success).toEqual(true);
      expect(result.booking.courtOrder).toEqual(3);
      expect(result.booking.rowCount).toEqual(3);
      expect(result.booking.notes).toEqual('Court resurfacing');
    });

    it('validates courtOrder is a positive integer', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      // Test zero
      let result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 0,
        courtId,
      });
      expect(result.error).toEqual(INVALID_VALUES);

      // Test negative
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: -1,
        courtId,
      });
      expect(result.error).toEqual(INVALID_VALUES);

      // Test non-integer
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 2.5,
        courtId,
      });
      expect(result.error).toEqual(INVALID_VALUES);
    });

    it('validates rowCount is a positive integer', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      const result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 1,
        rowCount: 0,
        courtId,
      });
      expect(result.error).toEqual(INVALID_VALUES);
    });

    it('returns error for non-existent court', () => {
      tournamentEngine.newTournamentRecord();

      const result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 1,
        courtId: 'non-existent-id',
      });
      expect(result.error).toEqual(COURT_NOT_FOUND);
    });

    it('detects conflicts with existing grid bookings', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      // Add first booking at rows 3-5
      let result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: PRACTICE,
        courtOrder: 3,
        rowCount: 3,
        courtId,
      });
      expect(result.success).toEqual(true);

      // Try to add overlapping booking at row 4 (conflicts)
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: MAINTENANCE,
        courtOrder: 4,
        courtId,
      });
      expect(result.error).toEqual(EXISTING_MATCHUPS);

      // Try to add overlapping booking at row 2 with rowCount 2 (conflicts with row 3)
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 2,
        rowCount: 2,
        courtId,
      });
      expect(result.error).toEqual(EXISTING_MATCHUPS);

      // Adding at row 1 should work (no conflict)
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 1,
        courtId,
      });
      expect(result.success).toEqual(true);

      // Adding at row 6 should work (no conflict)
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 6,
        courtId,
      });
      expect(result.success).toEqual(true);
    });

    it('creates dateAvailability if it does not exist', () => {
      const result = tournamentEngine.newTournamentRecord();
      expect(result.success).toEqual(true);

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      const bookingResult = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 1,
        courtId,
      });

      expect(bookingResult.success).toEqual(true);

      const { venue: venueObj } = tournamentEngine.findVenue({ venueId });
      const court = venueObj.courts.find((c) => c.courtId === courtId);

      expect(court.dateAvailability).toBeDefined();
      expect(court.dateAvailability.length).toBeGreaterThan(0);
    });

    it('allows bookings on different dates without conflict', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      // Add booking on date 1
      let result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 2,
        courtId,
      });
      expect(result.success).toEqual(true);

      // Add booking on date 2 at same row - should not conflict
      result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-16',
        bookingType: BLOCKED,
        courtOrder: 2,
        courtId,
      });
      expect(result.success).toEqual(true);
    });
  });

  describe('removeCourtGridBooking', () => {
    it('can remove a grid booking', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      // Add booking
      let result = tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: PRACTICE,
        courtOrder: 3,
        courtId,
      });
      expect(result.success).toEqual(true);

      // Remove booking
      result = tournamentEngine.removeCourtGridBooking({
        scheduledDate: '2024-01-15',
        courtOrder: 3,
        courtId,
      });
      expect(result.success).toEqual(true);
      expect(result.booking).toBeDefined();
      expect(result.booking.courtOrder).toEqual(3);

      // Verify booking is gone
      const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
      const court = foundVenue.courts.find((c) => c.courtId === courtId);

      const { gridBookings } = getGridBookings({
        court,
        date: '2024-01-15',
      });

      expect(gridBookings.has(3)).toEqual(false);
    });

    it('returns error when booking not found', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      const result = tournamentEngine.removeCourtGridBooking({
        scheduledDate: '2024-01-15',
        courtOrder: 5,
        courtId,
      });
      expect(result.error).toEqual(BOOKING_NOT_FOUND);
    });

    it('returns error for non-existent court', () => {
      tournamentEngine.newTournamentRecord();

      const result = tournamentEngine.removeCourtGridBooking({
        scheduledDate: '2024-01-15',
        courtOrder: 1,
        courtId: 'non-existent-id',
      });
      expect(result.error).toEqual(COURT_NOT_FOUND);
    });

    it('only removes the specified booking', () => {
      tournamentEngine.newTournamentRecord();

      const venue = { venueName: 'Test Venue' };
      const {
        venue: { venueId },
      } = tournamentEngine.addVenue({ venue });

      const {
        court: { courtId },
      } = tournamentEngine.addCourt({
        venueId,
        court: { courtName: 'Court 1' },
      });

      // Add multiple bookings
      tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: BLOCKED,
        courtOrder: 1,
        courtId,
      });
      tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: PRACTICE,
        courtOrder: 3,
        courtId,
      });
      tournamentEngine.addCourtGridBooking({
        scheduledDate: '2024-01-15',
        bookingType: MAINTENANCE,
        courtOrder: 5,
        courtId,
      });

      // Remove middle booking
      const result = tournamentEngine.removeCourtGridBooking({
        scheduledDate: '2024-01-15',
        courtOrder: 3,
        courtId,
      });
      expect(result.success).toEqual(true);

      // Verify other bookings still exist
      const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
      const court = foundVenue.courts.find((c) => c.courtId === courtId);

      const { gridBookings } = getGridBookings({
        court,
        date: '2024-01-15',
      });

      expect(gridBookings.has(1)).toEqual(true);
      expect(gridBookings.has(3)).toEqual(false); // Removed
      expect(gridBookings.has(5)).toEqual(true);
    });
  });
});
