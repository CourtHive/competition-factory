import { JSON2CSV, flattenJSON } from '@Tools/json';
import { describe, expect, test } from 'vitest';

describe('flattenJSON', () => {
  test('flattens nested objects', () => {
    const obj = {
      a: 1,
      b: {
        c: 2,
        d: 3,
      },
    };
    const result = flattenJSON(obj);
    expect(result).toEqual({
      a: 1,
      'b.c': 2,
      'b.d': 3,
    });
  });

  test('handles deeply nested objects', () => {
    const obj = {
      a: {
        b: {
          c: {
            d: 'value',
          },
        },
      },
    };
    const result = flattenJSON(obj);
    expect(result).toEqual({
      'a.b.c.d': 'value',
    });
  });

  test('handles custom key joiner', () => {
    const obj = {
      a: {
        b: 1,
      },
    };
    const result = flattenJSON(obj, '_');
    expect(result).toEqual({
      a_b: 1,
    });
  });

  test('handles arrays (treats as objects)', () => {
    const obj = {
      a: [1, 2, 3],
    };
    const result = flattenJSON(obj);
    expect(result).toEqual({
      'a.0': 1,
      'a.1': 2,
      'a.2': 3,
    });
  });

  test('handles empty objects', () => {
    const result = flattenJSON({});
    expect(result).toEqual({});
  });

  test('handles simple flat objects with various primitive values', () => {
    const obj = {
      a: 1,
      b: 'string',
      c: true,
      d: false,
      e: 0,
    };
    const result = flattenJSON(obj);
    expect(result).toEqual({
      a: 1,
      b: 'string',
      c: true,
      d: false,
      e: 0,
    });
  });
});

describe('JSON2CSV', () => {
  test('converts simple array of objects to CSV', () => {
    const data = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
    ];
    const result = JSON2CSV(data);

    expect(result).toContain('"name"');
    expect(result).toContain('"age"');
    expect(result).toContain('"Alice"');
    expect(result).toContain('"Bob"');
  });

  test('handles empty arrays', () => {
    const result = JSON2CSV([]);
    expect(result).toBe('');
  });

  test('handles column accessors', () => {
    const data = [
      { name: 'Alice', age: 25, secret: 'hidden' },
      { name: 'Bob', age: 30, secret: 'classified' },
    ];
    const config = {
      columnAccessors: ['name', 'age'],
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('Alice');
    expect(result).not.toContain('secret');
  });

  test('handles custom delimiter', () => {
    const data = [{ name: 'Alice' }];
    const config = {
      delimiter: "'",
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain("'name'");
    expect(result).toContain("'Alice'");
  });

  test('handles custom column joiner', () => {
    const data = [{ name: 'Alice', age: 25 }];
    const config = {
      columnJoiner: ';',
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain(';');
  });

  test('handles custom row joiner', () => {
    const data = [{ name: 'Alice' }, { name: 'Bob' }];
    const config = {
      rowJoiner: '||',
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('||');
  });

  test('handles includeHeaderRow option', () => {
    const data = [{ name: 'Alice' }];

    const withHeader = JSON2CSV(data, { includeHeaderRow: true });
    expect(withHeader).toContain('name');

    const withoutHeader = JSON2CSV(data, { includeHeaderRow: false });
    expect(withoutHeader).not.toContain('"name"');
    expect(withoutHeader).toContain('Alice');
  });

  test('handles onlyHeaderRow option', () => {
    const data = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
    ];
    const result = JSON2CSV(data, { onlyHeaderRow: true });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('name');
  });

  test('handles columnMap (rename columns)', () => {
    const data = [{ oldName: 'value' }];
    const config = {
      columnMap: { oldName: 'newName' },
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('newName');
  });

  test('handles context (add columns to all rows)', () => {
    const data = [{ name: 'Alice' }];
    const config = {
      context: { tournament: 'Wimbledon' },
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('tournament');
    expect(result).toContain('Wimbledon');
  });

  test('handles returnTransformedJSON option', () => {
    const data = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
    ];
    const result = JSON2CSV(data, { returnTransformedJSON: true });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('handles removeEmptyColumns option', () => {
    const data = [
      { name: 'Alice', empty: '' },
      { name: 'Bob', empty: '' },
    ];
    const config = {
      removeEmptyColumns: true,
    };
    const result = JSON2CSV(data, config);

    // Empty column should be removed
    expect(result).toContain('name');
  });

  test('handles valuesMap (map values)', () => {
    const data = [{ status: 1 }];
    const config = {
      valuesMap: {
        status: { 1: 'active', 0: 'inactive' },
      },
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('active');
  });

  test('handles functionMap (transform values)', () => {
    const data = [{ value: 5 }];
    const config = {
      functionMap: {
        value: (v) => v * 2,
      },
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('10');
  });

  test('handles columnTransform', () => {
    const data = [{ firstName: 'Alice', lastName: 'Smith' }];
    const config = {
      columnTransform: {
        fullName: ['firstName', 'lastName'],
      },
      includeTransformAccessors: true,
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('fullName');
  });

  test('handles nested objects (flattening)', () => {
    const data = [
      {
        person: {
          name: 'Alice',
          age: 25,
        },
      },
    ];
    const result = JSON2CSV(data);

    expect(result).toContain('person.name');
    expect(result).toContain('person.age');
  });

  test('returns error for invalid config types', () => {
    const data = [{ name: 'Alice' }];

    const result1 = JSON2CSV(data, 'invalid' as any);
    expect(result1.error).toBeDefined();
  });

  test('returns error for non-array input', () => {
    const result = JSON2CSV('not an array' as any);
    expect(result.error).toBeDefined();
  });

  test('handles sortOrder option', () => {
    const data = [{ c: 3, b: 2, a: 1 }];
    const config = {
      sortOrder: ['a', 'b', 'c'],
    };
    const result = JSON2CSV(data, config);

    // Check that columns appear in sorted order
    const lines = result.split('\r\n');
    const header = lines[0];
    const aIndex = header.indexOf('"a"');
    const bIndex = header.indexOf('"b"');
    const cIndex = header.indexOf('"c"');

    expect(aIndex).toBeLessThan(bIndex);
    expect(bIndex).toBeLessThan(cIndex);
  });

  test('handles custom keyJoiner for nested objects', () => {
    const data = [
      {
        person: {
          name: 'Alice',
        },
      },
    ];
    const config = {
      keyJoiner: '_',
    };
    const result = JSON2CSV(data, config);

    expect(result).toContain('person_name');
  });
});
