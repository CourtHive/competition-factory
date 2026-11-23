/**
 * TEST SUITE: src/tools/getAccessorValue.ts
 * Target Coverage: 100%
 * Expanded for full coverage
 */

import { getAccessorValue } from '@Tools/getAccessorValue';
import { expect, it, describe } from 'vitest';

const MAIN_STREET = 'Main Street';

it('can extract values from nested objects', () => {
  const element = {
    person: {
      name: 'Name',
      addresses: [
        { street: MAIN_STREET, city: 'New York' },
        { street: MAIN_STREET, city: 'San Francisco' },
      ],
    },
  };

  let { value, values } = getAccessorValue({
    element,
    accessor: 'person.name',
  });
  expect(value).toEqual('Name');
  expect(values).toEqual(['Name']);

  ({ value, values } = getAccessorValue({
    accessor: 'person.addresses.street',
    element,
  }));
  expect(value).toEqual(MAIN_STREET);
  expect(values).toEqual([MAIN_STREET]);

  ({ value, values } = getAccessorValue({
    accessor: 'person.addresses.city',
    element,
  }));
  expect(value).toEqual('New York');
  expect(values).toEqual(['New York', 'San Francisco']);
});

// ============================================================================
// ADDITIONAL TESTS FOR FULL COVERAGE
// ============================================================================

describe('getAccessorValue - Edge Cases', () => {
  it('should handle non-string accessors', () => {
    const element = { key: 'value' };

    expect(getAccessorValue({ element, accessor: null })).toEqual({ values: [] });
    expect(getAccessorValue({ element, accessor: 123 })).toEqual({ values: [] });
    expect(getAccessorValue({ element, accessor: undefined })).toEqual({ values: [] });
  });

  it('should handle undefined intermediate paths', () => {
    const element = { a: { b: null } };
    const result = getAccessorValue({ element, accessor: 'a.b.c' });
    expect(result.values).toEqual(undefined);
  });

  it('should handle missing properties', () => {
    const element = { a: 1 };
    const result = getAccessorValue({ element, accessor: 'b.c.d' });
    expect(result.values).toEqual(undefined);
  });

  it('should not include duplicate values', () => {
    const element = {
      items: [{ status: 'active' }, { status: 'active' }, { status: 'inactive' }],
    };

    const result = getAccessorValue({ element, accessor: 'items.status' });
    expect(result.values).toEqual(['active', 'inactive']);
  });

  it('should handle numeric values', () => {
    const element = {
      scores: [{ value: 10 }, { value: 20 }],
    };

    const result = getAccessorValue({ element, accessor: 'scores.value' });
    expect(result.values).toEqual([10, 20]);
  });

  it('should handle empty arrays', () => {
    const element = { items: [] };
    const result = getAccessorValue({ element, accessor: 'items.name' });
    expect(result.values).toEqual(undefined);
  });

  it('should handle deeply nested arrays', () => {
    const element = {
      level1: [{ level2: [{ value: 'a' }, { value: 'b' }] }, { level2: [{ value: 'c' }] }],
    };

    const result = getAccessorValue({ element, accessor: 'level1.level2.value' });
    expect(result.values).toEqual(['a', 'b', 'c']);
  });
});
