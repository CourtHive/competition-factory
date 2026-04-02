import { expect, it, describe, beforeEach } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';

describe('competitionScheduleMatchUps with blocked cells', () => {
  beforeEach(() => {
    tournamentEngine.devContext(true);
    tournamentEngine.reset();
  });

  it('returns blocked cells when withCourtGridRows is true', () => {
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

    // Add a grid booking at row 2
    const bookingResult = tournamentEngine.addCourtGridBooking({
      scheduledDate: '2024-01-15',
      bookingType: 'BLOCKED',
      courtOrder: 2,
      rowCount: 1,
      courtId,
    });
    expect(bookingResult.success).toEqual(true);

    // Call competitionScheduleMatchUps with courtGridRows
    const scheduleResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: '2024-01-15' },
      withCourtGridRows: true,
      minCourtGridRows: 5,
    });

    expect(scheduleResult.success).toEqual(true);
    expect(scheduleResult.rows).toBeDefined();
    expect(scheduleResult.rows.length).toBeGreaterThanOrEqual(5);

    // Row 2 (index 1) should be blocked
    const row2 = scheduleResult.rows[1];
    const court0Cell = row2['C|0'];

    expect(court0Cell.isBlocked).toEqual(true);
    expect(court0Cell.booking).toBeDefined();
    expect(court0Cell.booking.bookingType).toEqual('BLOCKED');
    expect(court0Cell.booking.courtOrder).toEqual(2);
    expect(court0Cell.booking.rowCount).toEqual(1);

    // Row 1 should not be blocked
    const row1 = scheduleResult.rows[0];
    expect(row1['C|0'].isBlocked).toBeUndefined();
  });

  it('blocks cells only for the specified date', () => {
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

    // Add booking for Jan 15
    tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: 'BLOCKED',
    });

    // Check Jan 15 - should be blocked
    const jan15Result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: '2024-01-15' },
      withCourtGridRows: true,
      minCourtGridRows: 5,
    });
    expect(jan15Result.rows[1]['C|0'].isBlocked).toEqual(true);

    // Check Jan 16 - should NOT be blocked
    const jan16Result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: '2024-01-16' },
      withCourtGridRows: true,
      minCourtGridRows: 5,
    });
    expect(jan16Result.rows[1]['C|0'].isBlocked).toBeUndefined();
  });

  it('blocks cells only for the specified court', () => {
    tournamentEngine.newTournamentRecord();

    const venue = { venueName: 'Test Venue' };
    const {
      venue: { venueId },
    } = tournamentEngine.addVenue({ venue });

    const {
      court: { courtId: court1Id },
    } = tournamentEngine.addCourt({
      venueId,
      court: { courtName: 'Court 1' },
    });

    tournamentEngine.addCourt({
      venueId,
      court: { courtName: 'Court 2' },
    });

    // Add booking to Court 1 only
    tournamentEngine.addCourtGridBooking({
      courtId: court1Id,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: 'BLOCKED',
    });

    const scheduleResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: '2024-01-15' },
      withCourtGridRows: true,
      minCourtGridRows: 5,
    });

    const row2 = scheduleResult.rows[1];

    // Court 1 (C|0) should be blocked
    expect(row2['C|0'].isBlocked).toEqual(true);

    // Court 2 (C|1) should NOT be blocked
    expect(row2['C|1'].isBlocked).toBeUndefined();
  });

  it('handles multiple bookings on different courts and rows', () => {
    tournamentEngine.newTournamentRecord();

    const venue = { venueName: 'Test Venue' };
    const {
      venue: { venueId },
    } = tournamentEngine.addVenue({ venue });

    const {
      court: { courtId: court1Id },
    } = tournamentEngine.addCourt({
      venueId,
      court: { courtName: 'Court 1' },
    });

    const {
      court: { courtId: court2Id },
    } = tournamentEngine.addCourt({
      venueId,
      court: { courtName: 'Court 2' },
    });

    // Block row 2 on Court 1
    tournamentEngine.addCourtGridBooking({
      courtId: court1Id,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: 'BLOCKED',
    });

    // Block rows 3-4 on Court 2
    tournamentEngine.addCourtGridBooking({
      courtId: court2Id,
      scheduledDate: '2024-01-15',
      courtOrder: 3,
      rowCount: 2,
      bookingType: 'MAINTENANCE',
    });

    const scheduleResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: '2024-01-15' },
      withCourtGridRows: true,
      minCourtGridRows: 5,
    });

    // Row 2: Court 1 blocked, Court 2 not blocked
    expect(scheduleResult.rows[1]['C|0'].isBlocked).toEqual(true);
    expect(scheduleResult.rows[1]['C|0'].booking.bookingType).toEqual('BLOCKED');
    expect(scheduleResult.rows[1]['C|1'].isBlocked).toBeUndefined();

    // Row 3: Court 1 not blocked, Court 2 blocked
    expect(scheduleResult.rows[2]['C|0'].isBlocked).toBeUndefined();
    expect(scheduleResult.rows[2]['C|1'].isBlocked).toEqual(true);
    expect(scheduleResult.rows[2]['C|1'].booking.bookingType).toEqual('MAINTENANCE');

    // Row 4: Court 1 not blocked, Court 2 blocked
    expect(scheduleResult.rows[3]['C|0'].isBlocked).toBeUndefined();
    expect(scheduleResult.rows[3]['C|1'].isBlocked).toEqual(true);
    expect(scheduleResult.rows[3]['C|1'].booking.bookingType).toEqual('MAINTENANCE');
  });

  it('does not return blocked cells when withCourtGridRows is false', () => {
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

    // Add a grid booking
    tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: 'BLOCKED',
    });

    // Call WITHOUT withCourtGridRows
    const scheduleResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: '2024-01-15' },
      withCourtGridRows: false,
    });

    // Should not have rows property
    expect(scheduleResult.rows).toBeUndefined();
    expect(scheduleResult.courtsData).toBeDefined();
  });

});
