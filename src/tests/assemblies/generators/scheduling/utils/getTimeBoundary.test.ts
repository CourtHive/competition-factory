import { getDateTimeBoundary, getCourtsTimeBoundary, getCourtTimeBoundary } from '@Helpers/scheduling/getTimeBoundary';
import { describe, expect, it } from 'vitest';

describe('getDateTimeBoundary', () => {
  it('finds earliest startTime across courts for a date', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [{ date: '2024-01-01', startTime: '10:00', endTime: '18:00' }],
      },
      {
        courtId: 'c2',
        dateAvailability: [{ date: '2024-01-01', startTime: '08:00', endTime: '17:00' }],
      },
      {
        courtId: 'c3',
        dateAvailability: [{ date: '2024-01-01', startTime: '09:00', endTime: '19:00' }],
      },
    ];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      startTime: true,
      courts,
    });

    expect(result).toBe('08:00');
  });

  it('finds latest endTime across courts for a date', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [{ date: '2024-01-01', startTime: '10:00', endTime: '18:00' }],
      },
      {
        courtId: 'c2',
        dateAvailability: [{ date: '2024-01-01', startTime: '08:00', endTime: '17:00' }],
      },
      {
        courtId: 'c3',
        dateAvailability: [{ date: '2024-01-01', startTime: '09:00', endTime: '19:00' }],
      },
    ];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      endTime: true,
      courts,
    });

    expect(result).toBe('19:00');
  });

  it('uses court default times when dateAvailability missing', () => {
    const courts = [
      { courtId: 'c1', startTime: '09:00', endTime: '17:00' },
      { courtId: 'c2', startTime: '08:00', endTime: '18:00' },
    ];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      startTime: true,
      courts,
    });

    expect(result).toBe('08:00');
  });

  it('returns undefined when no courts have times', () => {
    const courts = [{ courtId: 'c1' }, { courtId: 'c2' }];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      startTime: true,
      courts,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for empty courts array', () => {
    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      startTime: true,
      courts: [],
    });

    expect(result).toBeUndefined();
  });

  it('handles courts with mixed availability', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [{ date: '2024-01-01', startTime: '10:00' }],
      },
      {
        courtId: 'c2',
        startTime: '08:00',
      },
      {
        courtId: 'c3',
      },
    ];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      startTime: true,
      courts,
    });

    expect(result).toBe('08:00');
  });

  it('handles dateAvailability for different dates', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [
          { date: '2024-01-01', startTime: '09:00', endTime: '17:00' },
          { date: '2024-01-02', startTime: '10:00', endTime: '18:00' },
        ],
      },
    ];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-02',
      startTime: true,
      courts,
    });

    expect(result).toBe('10:00');
  });

  it('prioritizes dateAvailability over court default', () => {
    const courts = [
      {
        courtId: 'c1',
        startTime: '09:00',
        dateAvailability: [{ date: '2024-01-01', startTime: '08:00' }],
      },
    ];

    const result = getDateTimeBoundary({
      scheduleDate: '2024-01-01',
      startTime: true,
      courts,
    });

    expect(result).toBe('08:00');
  });
});

describe('getCourtsTimeBoundary', () => {
  it('finds earliest startTime across all court availabilities', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [
          { date: '2024-01-01', startTime: '09:00' },
          { date: '2024-01-02', startTime: '10:00' },
        ],
      },
      {
        courtId: 'c2',
        dateAvailability: [{ date: '2024-01-01', startTime: '08:00' }],
      },
    ];

    const result = getCourtsTimeBoundary({
      endTime: undefined,
      startTime: true,
      courts,
    });

    expect(result).toBe('08:00');
  });

  it('finds latest endTime across all court availabilities', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [
          { date: '2024-01-01', endTime: '18:00' },
          { date: '2024-01-02', endTime: '17:00' },
        ],
      },
      {
        courtId: 'c2',
        dateAvailability: [{ date: '2024-01-01', endTime: '19:00' }],
      },
    ];

    const result = getCourtsTimeBoundary({
      endTime: true,
      startTime: undefined,
      courts,
    });

    expect(result).toBe('19:00');
  });

  it('returns undefined when no dateAvailability', () => {
    const courts = [{ courtId: 'c1' }, { courtId: 'c2' }];

    const result = getCourtsTimeBoundary({
      startTime: true,
      endTime: undefined,
      courts,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for empty courts', () => {
    const result = getCourtsTimeBoundary({
      startTime: true,
      endTime: undefined,
      courts: [],
    });

    expect(result).toBeUndefined();
  });

  it('handles courts with missing times in availability', () => {
    const courts = [
      {
        courtId: 'c1',
        dateAvailability: [
          { date: '2024-01-01', startTime: '09:00' },
          { date: '2024-01-02' }, // No time
        ],
      },
      {
        courtId: 'c2',
        dateAvailability: [{ date: '2024-01-01', startTime: '08:00' }],
      },
    ];

    const result = getCourtsTimeBoundary({
      startTime: true,
      endTime: undefined,
      courts,
    });

    expect(result).toBe('08:00');
  });
});

describe('getCourtTimeBoundary', () => {
  it('finds earliest startTime in court dateAvailability', () => {
    const court = {
      courtId: 'c1',
      dateAvailability: [
        { date: '2024-01-01', startTime: '10:00' },
        { date: '2024-01-02', startTime: '08:00' },
        { date: '2024-01-03', startTime: '09:00' },
      ],
    };

    const result = getCourtTimeBoundary({
      startTime: true,
      endTime: undefined,
      court,
    });

    expect(result).toBe('08:00');
  });

  it('returns undefined when court has no dateAvailability', () => {
    const court = { courtId: 'c1' };

    const result = getCourtTimeBoundary({
      endTime: undefined,
      startTime: true,
      court,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined when dateAvailability is empty', () => {
    const court = {
      courtId: 'c1',
      dateAvailability: [],
    };

    const result = getCourtTimeBoundary({
      endTime: undefined,
      startTime: true,
      court,
    });

    expect(result).toBeUndefined();
  });

  it('handles dateAvailability entries without times', () => {
    const court = {
      courtId: 'c1',
      dateAvailability: [{ date: '2024-01-01' }, { date: '2024-01-02', startTime: '09:00' }],
    };

    const result = getCourtTimeBoundary({
      startTime: true,
      endTime: undefined,
      court,
    });

    expect(result).toBe('09:00');
  });

  it('handles all dateAvailability entries without times', () => {
    const court = {
      courtId: 'c1',
      dateAvailability: [{ date: '2024-01-01' }, { date: '2024-01-02' }],
    };

    const result = getCourtTimeBoundary({
      endTime: undefined,
      startTime: true,
      court,
    });

    expect(result).toBeUndefined();
  });

  it('returns first time when all times are equal', () => {
    const court = {
      courtId: 'c1',
      dateAvailability: [
        { date: '2024-01-01', startTime: '09:00' },
        { date: '2024-01-02', startTime: '09:00' },
      ],
    };

    const result = getCourtTimeBoundary({
      endTime: undefined,
      startTime: true,
      court,
    });

    expect(result).toBe('09:00');
  });

  it('handles times in different formats', () => {
    const court = {
      courtId: 'c1',
      dateAvailability: [
        { date: '2024-01-01', startTime: '09:00:00' },
        { date: '2024-01-02', startTime: '08:30' },
      ],
    };

    const result = getCourtTimeBoundary({
      endTime: undefined,
      startTime: true,
      court,
    });

    expect(result).toBe('08:30');
  });
});
