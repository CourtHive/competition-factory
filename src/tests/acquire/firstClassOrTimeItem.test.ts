/**
 * Unit tests for the CODES timeItem read helper.
 */
import { describe, expect, it } from 'vitest';

import { firstClassOrTimeItem } from '@Acquire/firstClassOrTimeItem';

describe('firstClassOrTimeItem', () => {
  it('returns the first-class schedule attribute when defined', () => {
    const matchUp = { schedule: { scheduledDate: '2026-06-01' }, timeItems: [] };
    expect(firstClassOrTimeItem({ element: matchUp, attribute: 'scheduledDate', itemType: 'SCHEDULED_DATE' })).toBe(
      '2026-06-01',
    );
  });

  it('falls back to the latest matching timeItem when the first-class is missing', () => {
    const matchUp = {
      timeItems: [
        { itemType: 'SCHEDULED_DATE', itemValue: '2026-06-01', createdAt: '2026-05-01T10:00:00Z' },
        { itemType: 'SCHEDULED_DATE', itemValue: '2026-06-02', createdAt: '2026-05-15T10:00:00Z' },
      ],
    };
    const result = firstClassOrTimeItem({ element: matchUp, attribute: 'scheduledDate', itemType: 'SCHEDULED_DATE' });
    // getTimeItem picks the most recent by createdAt
    expect(result).toBe('2026-06-02');
  });

  it('returns undefined when neither first-class nor timeItems are present', () => {
    expect(
      firstClassOrTimeItem({ element: {}, attribute: 'scheduledDate', itemType: 'SCHEDULED_DATE' }),
    ).toBeUndefined();
  });

  it('returns undefined when timeItems is not an array', () => {
    expect(
      firstClassOrTimeItem({ element: { timeItems: null }, attribute: 'scheduledDate', itemType: 'SCHEDULED_DATE' }),
    ).toBeUndefined();
  });

  it('honors a custom scheduleObject key', () => {
    const matchUp = { custom: { foo: 'bar' } };
    expect(
      firstClassOrTimeItem({ element: matchUp, scheduleObject: 'custom', attribute: 'foo', itemType: 'FOO' }),
    ).toBe('bar');
  });
});
