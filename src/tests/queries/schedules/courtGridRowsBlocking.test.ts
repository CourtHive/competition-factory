import { courtGridRows } from '@Assemblies/generators/scheduling/courtGridRows';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { BLOCKED, MAINTENANCE } from '@Constants/bookingTypeConstants';

describe('courtGridRows with grid bookings', () => {
  it('marks cells as blocked when grid bookings exist', () => {
    tournamentEngine.devContext(true);
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
    const result = tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: BLOCKED,
    });
    expect(result.success).toEqual(true);

    // Get the court with booking added
    const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
    const court = foundVenue.courts.find((c) => c.courtId === courtId);

    // Call courtGridRows with the court
    const courtsData = [{ ...court, matchUps: [] }];
    const gridResult = courtGridRows({
      scheduledDate: '2024-01-15',
      minRowsCount: 5,
      courtsData,
    });

    expect(gridResult.rows).toBeDefined();
    expect(gridResult.rows?.length).toBeGreaterThanOrEqual(5);

    // Row 2 (index 1) should be blocked
    const row2 = gridResult.rows?.[1];
    const cell = row2['C|0'];

    expect(cell.isBlocked).toEqual(true);
    expect(cell.booking).toBeDefined();
    expect(cell.booking.bookingType).toEqual(BLOCKED);
    expect(cell.booking.courtOrder).toEqual(2);

    // Other rows should not be blocked
    const row1 = gridResult.rows?.[0]['C|0'];
    const row3 = gridResult.rows?.[2]['C|0'];
    expect(row1.isBlocked).toBeUndefined();
    expect(row3.isBlocked).toBeUndefined();
  });

  it('marks multiple consecutive rows as blocked', () => {
    tournamentEngine.devContext(true);
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

    // Add a booking spanning 3 rows starting at row 3
    tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: '2024-01-15',
      courtOrder: 3,
      rowCount: 3,
      bookingType: MAINTENANCE,
    });

    const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
    const court = foundVenue.courts.find((c) => c.courtId === courtId);

    const courtsData = [{ ...court, matchUps: [] }];
    const gridResult = courtGridRows({
      scheduledDate: '2024-01-15',
      minRowsCount: 6,
      courtsData,
    });

    // Rows 3, 4, 5 should be blocked
    expect(gridResult.rows?.[2]['C|0'].isBlocked).toEqual(true);
    expect(gridResult.rows?.[2]['C|0'].booking.bookingType).toEqual(MAINTENANCE);

    expect(gridResult.rows?.[3]['C|0'].isBlocked).toEqual(true);
    expect(gridResult.rows?.[3]['C|0'].booking.bookingType).toEqual(MAINTENANCE);

    expect(gridResult.rows?.[4]['C|0'].isBlocked).toEqual(true);
    expect(gridResult.rows?.[4]['C|0'].booking.bookingType).toEqual(MAINTENANCE);

    // Rows 2 and 6 should NOT be blocked
    expect(gridResult.rows?.[1]['C|0'].isBlocked).toBeUndefined();
    expect(gridResult.rows?.[5]['C|0'].isBlocked).toBeUndefined();
  });

  it('does not mark cells as blocked without scheduledDate', () => {
    tournamentEngine.devContext(true);
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
      bookingType: BLOCKED,
    });

    const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
    const court = foundVenue.courts.find((c) => c.courtId === courtId);

    // Call courtGridRows WITHOUT scheduledDate
    const courtsData = [{ ...court, matchUps: [] }];
    const gridResult = courtGridRows({
      scheduledDate: undefined,
      minRowsCount: 5,
      courtsData,
    });

    // No cells should be blocked when scheduledDate is not provided
    gridResult.rows?.forEach((row) => {
      expect(row['C|0'].isBlocked).toBeUndefined();
    });
  });

  it('only blocks cells for the specified date', () => {
    tournamentEngine.devContext(true);
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
      bookingType: BLOCKED,
    });

    const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
    const court = foundVenue.courts.find((c) => c.courtId === courtId);
    const courtsData = [{ ...court, matchUps: [] }];

    // Check Jan 15 - should be blocked
    const jan15Result = courtGridRows({
      scheduledDate: '2024-01-15',
      minRowsCount: 5,
      courtsData,
    });
    expect(jan15Result.rows?.[1]['C|0'].isBlocked).toEqual(true);

    // Check Jan 16 - should NOT be blocked
    const jan16Result = courtGridRows({
      scheduledDate: '2024-01-16',
      minRowsCount: 5,
      courtsData,
    });
    expect(jan16Result.rows?.[1]['C|0'].isBlocked).toBeUndefined();
  });

  it('only blocks cells for the specified court when multiple courts exist', () => {
    tournamentEngine.devContext(true);
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

    // Add booking to Court 1 only
    tournamentEngine.addCourtGridBooking({
      courtId: court1Id,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: BLOCKED,
    });

    const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
    const court1 = foundVenue.courts.find((c) => c.courtId === court1Id);
    const court2 = foundVenue.courts.find((c) => c.courtId === court2Id);

    const courtsData = [
      { ...court1, matchUps: [] },
      { ...court2, matchUps: [] },
    ];

    const gridResult = courtGridRows({
      scheduledDate: '2024-01-15',
      minRowsCount: 5,
      courtsData,
    });

    const row2 = gridResult.rows?.[1];

    // Court 1 (C|0) should be blocked
    expect(row2['C|0'].isBlocked).toEqual(true);
    expect(row2['C|0'].booking.bookingType).toEqual(BLOCKED);

    // Court 2 (C|1) should NOT be blocked
    expect(row2['C|1'].isBlocked).toBeUndefined();
  });

  it('preserves matchUp data when cell is not blocked', () => {
    tournamentEngine.devContext(true);
    const { tournamentRecord } = tournamentEngine.newTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

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

    const event = { eventName: 'Test Event' };
    const {
      event: { eventId },
    } = tournamentEngine.addEvent({ event });

    const { drawDefinition } = tournamentEngine.generateDrawDefinition({
      eventId,
      drawSize: 4,
    });
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps[0];

    // Schedule a matchUp at row 1
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      schedule: {
        scheduledDate: '2024-01-15',
        courtOrder: 1,
        venueId,
        courtId,
      },
    });

    // Add booking at row 2 (different from matchUp)
    tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: '2024-01-15',
      courtOrder: 2,
      rowCount: 1,
      bookingType: BLOCKED,
    });

    const { venue: foundVenue } = tournamentEngine.findVenue({ venueId });
    const court = foundVenue.courts.find((c) => c.courtId === courtId);

    const courtsData = [
      {
        ...court,
        matchUps: [{ ...matchUp, schedule: { ...matchUp.schedule, courtOrder: 1 } }],
      },
    ];

    const gridResult = courtGridRows({
      scheduledDate: '2024-01-15',
      minRowsCount: 5,
      courtsData,
    });

    // Row 1 should have matchUp (not blocked)
    const row1Cell = gridResult.rows?.[0]['C|0'];
    expect(row1Cell.matchUpId).toEqual(matchUp.matchUpId);
    expect(row1Cell.isBlocked).toBeUndefined();

    // Row 2 should be blocked (no matchUp)
    const row2Cell = gridResult.rows?.[1]['C|0'];
    expect(row2Cell.isBlocked).toEqual(true);
    expect(row2Cell.matchUpId).toBeUndefined();
  });
});
