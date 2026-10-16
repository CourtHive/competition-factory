import { applyVenueConstraints } from '@Query/venues/applyVenueConstraints';
import { expect, test } from 'vitest';

// constants
import { PRACTICE, MAINTENANCE } from '@Constants/bookingTypeConstants';

test('no-op when venue has no scheduling attributes', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [{ date: '2024-01-01', startTime: '07:00', endTime: '19:00' }],
  };
  const venue: any = { venueId: 'v1' };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability).toEqual([{ date: '2024-01-01', startTime: '07:00', endTime: '19:00' }]);
});

test('court inherits venue dateAvailability when court has none', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [],
  };
  const venue: any = {
    venueId: 'v1',
    dateAvailability: [
      { startTime: '09:00', endTime: '17:00' },
      { date: '2024-01-01', startTime: '10:00', endTime: '16:00' },
    ],
  };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability).toHaveLength(2);
  expect(inContextCourt.dateAvailability[0].startTime).toEqual('09:00');
  expect(inContextCourt.dateAvailability[1].date).toEqual('2024-01-01');
});

test('court inherits venue defaults when court has no dateAvailability and venue has no dateAvailability', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
  };
  const venue: any = {
    venueId: 'v1',
    defaultStartTime: '08:00',
    defaultEndTime: '18:00',
  };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability).toHaveLength(1);
  expect(inContextCourt.dateAvailability[0]).toEqual({ startTime: '08:00', endTime: '18:00' });
});

test('intersect: venue constrains wider court window', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [{ date: '2024-01-01', startTime: '07:00', endTime: '19:00' }],
  };
  const venue: any = {
    venueId: 'v1',
    defaultStartTime: '09:00',
    defaultEndTime: '17:00',
  };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability[0].startTime).toEqual('09:00');
  expect(inContextCourt.dateAvailability[0].endTime).toEqual('17:00');
});

test('preserve: narrower court window is not expanded', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [{ date: '2024-01-01', startTime: '10:00', endTime: '15:00' }],
  };
  const venue: any = {
    venueId: 'v1',
    defaultStartTime: '07:00',
    defaultEndTime: '21:00',
  };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability[0].startTime).toEqual('10:00');
  expect(inContextCourt.dateAvailability[0].endTime).toEqual('15:00');
});

test('venue date-specific override takes precedence over venue defaults', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [
      { date: '2024-01-01', startTime: '07:00', endTime: '19:00' },
      { date: '2024-01-02', startTime: '07:00', endTime: '19:00' },
    ],
  };
  const venue: any = {
    venueId: 'v1',
    defaultStartTime: '08:00',
    defaultEndTime: '20:00',
    dateAvailability: [{ date: '2024-01-01', startTime: '10:00', endTime: '14:00' }],
  };

  applyVenueConstraints({ inContextCourt, venue });

  // Jan 1 uses venue date-specific (10:00-14:00)
  expect(inContextCourt.dateAvailability[0].startTime).toEqual('10:00');
  expect(inContextCourt.dateAvailability[0].endTime).toEqual('14:00');

  // Jan 2 uses venue defaults (08:00-20:00), intersected with court (07:00-19:00) => 08:00-19:00
  expect(inContextCourt.dateAvailability[1].startTime).toEqual('08:00');
  expect(inContextCourt.dateAvailability[1].endTime).toEqual('19:00');
});

test('venue dateless default takes precedence over defaultStartTime/defaultEndTime', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [{ date: '2024-01-01', startTime: '07:00', endTime: '19:00' }],
  };
  const venue: any = {
    venueId: 'v1',
    defaultStartTime: '06:00',
    defaultEndTime: '22:00',
    dateAvailability: [{ startTime: '09:00', endTime: '17:00' }],
  };

  applyVenueConstraints({ inContextCourt, venue });

  // Uses dateless default (09:00-17:00), not defaultStartTime/defaultEndTime
  expect(inContextCourt.dateAvailability[0].startTime).toEqual('09:00');
  expect(inContextCourt.dateAvailability[0].endTime).toEqual('17:00');
});

test('bookings are merged from venue and court', () => {
  const courtBooking = { startTime: '10:00', endTime: '11:00', bookingType: PRACTICE };
  const venueBooking = { startTime: '14:00', endTime: '15:00', bookingType: MAINTENANCE };

  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [{ date: '2024-01-01', startTime: '08:00', endTime: '18:00', bookings: [courtBooking] }],
  };
  const venue: any = {
    venueId: 'v1',
    dateAvailability: [{ date: '2024-01-01', startTime: '08:00', endTime: '18:00', bookings: [venueBooking] }],
  };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability[0].bookings).toHaveLength(2);
  expect(inContextCourt.dateAvailability[0].bookings[0]).toEqual(courtBooking);
  expect(inContextCourt.dateAvailability[0].bookings[1]).toEqual(venueBooking);
});

test('no bookings property when neither venue nor court have bookings', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [{ date: '2024-01-01', startTime: '07:00', endTime: '19:00' }],
  };
  const venue: any = {
    venueId: 'v1',
    defaultStartTime: '09:00',
    defaultEndTime: '17:00',
  };

  applyVenueConstraints({ inContextCourt, venue });

  expect(inContextCourt.dateAvailability[0].bookings).toBeUndefined();
});

test('inherited venue availability is a copy, not a reference', () => {
  const inContextCourt: any = {
    venueId: 'v1',
    courtId: 'c1',
    dateAvailability: [],
  };
  const venueAvail = { startTime: '09:00', endTime: '17:00' };
  const venue: any = {
    venueId: 'v1',
    dateAvailability: [venueAvail],
  };

  applyVenueConstraints({ inContextCourt, venue });

  // Modify the court's copy
  inContextCourt.dateAvailability[0].startTime = '10:00';

  // Venue original should be unchanged
  expect(venueAvail.startTime).toEqual('09:00');
});
