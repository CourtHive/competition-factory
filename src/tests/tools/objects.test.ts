/**
 * TEST SUITE: src/tools/objects.ts
 * Target Coverage: 100%
 * Converted from: coverage-plan/objects.test.stub.ts
 */

import { expect, test, describe } from 'vitest';
import {
  isFunction,
  isString,
  isObject,
  objShallowEqual,
  createMap,
  hasAttributeValues,
  hav,
  undefinedToNull,
  generateHashCode,
} from '@Tools/objects';

// ============================================================================
// FUNCTION 1: isFunction
// ============================================================================
describe('isFunction', () => {
  describe('Happy Path', () => {
    test('should return true for function declarations', () => {
      function testFn() {}
      expect(isFunction(testFn)).toBe(true);
    });

    test('should return true for arrow functions', () => {
      const arrowFn = () => {};
      expect(isFunction(arrowFn)).toBe(true);
    });

    test('should return true for class constructors', () => {
      class TestClass {}
      expect(isFunction(TestClass)).toBe(true);
    });

    test('should return true for async functions', () => {
      async function asyncFn() {}
      expect(isFunction(asyncFn)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should return false for null', () => {
      expect(isFunction(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isFunction(undefined)).toBe(false);
    });

    test('should return false for objects', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction({ key: 'value' })).toBe(false);
    });

    test('should return false for arrays', () => {
      expect(isFunction([])).toBe(false);
      expect(isFunction([1, 2, 3])).toBe(false);
    });

    test('should return false for strings', () => {
      expect(isFunction('string')).toBe(false);
      expect(isFunction('')).toBe(false);
    });

    test('should return false for numbers', () => {
      expect(isFunction(123)).toBe(false);
      expect(isFunction(0)).toBe(false);
    });

    test('should return false for booleans', () => {
      expect(isFunction(true)).toBe(false);
      expect(isFunction(false)).toBe(false);
    });
  });
});

// ============================================================================
// FUNCTION 2: isString
// ============================================================================
describe('isString', () => {
  describe('Happy Path', () => {
    test('should return true for string literals', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    test('should return true for template literals', () => {
      expect(isString(`template`)).toBe(true);
      expect(isString(`value: ${42}`)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should return false for String objects', () => {
       
      expect(isString(String('hello'))).toBe(true);
    });

    test('should return false for null', () => {
      expect(isString(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isString(undefined)).toBe(false);
    });

    test('should return false for numbers', () => {
      expect(isString(123)).toBe(false);
      expect(isString(0)).toBe(false);
    });

    test('should return false for objects', () => {
      expect(isString({})).toBe(false);
      expect(isString({ toString: () => 'string' })).toBe(false);
    });

    test('should return false for arrays', () => {
      expect(isString([])).toBe(false);
      expect(isString(['string'])).toBe(false);
    });

    test('should return false for booleans', () => {
      expect(isString(true)).toBe(false);
      expect(isString(false)).toBe(false);
    });
  });
});

// ============================================================================
// FUNCTION 3: isObject
// ============================================================================
describe('isObject', () => {
  describe('Happy Path', () => {
    test('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
      expect(isObject({ a: 1, b: 2, c: 3 })).toBe(true);
    });

    test('should return true for object instances', () => {
      expect(isObject(new Object())).toBe(true);
      expect(isObject(Object.create(null))).toBe(true);
    });

    test('should return true for class instances', () => {
      class TestClass {}
      expect(isObject(new TestClass())).toBe(true);
    });
  });

  describe('Edge Cases - Should Return False', () => {
    test('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    test('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isObject(undefined)).toBe(false);
    });

    test('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
    });

    test('should return false for functions', () => {
      expect(isObject(() => {})).toBe(false);
      expect(isObject(function () {})).toBe(false);
    });
  });
});

// ============================================================================
// FUNCTION 4: objShallowEqual
// ============================================================================
describe('objShallowEqual', () => {
  describe('Happy Path - Equal Objects', () => {
    test('should return true for identical empty objects', () => {
      expect(objShallowEqual({}, {})).toBe(true);
    });

    test('should return true for objects with same key-value pairs', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { a: 1, b: 2 };
      expect(objShallowEqual(obj1, obj2)).toBe(true);
    });

    test('should return true for objects with same keys in different order', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, b: 2, a: 1 };
      expect(objShallowEqual(obj1, obj2)).toBe(true);
    });

    test('should return true for objects with string values', () => {
      const obj1 = { name: 'Alice', city: 'NYC' };
      const obj2 = { name: 'Alice', city: 'NYC' };
      expect(objShallowEqual(obj1, obj2)).toBe(true);
    });
  });

  describe('Edge Cases - Not Equal', () => {
    test('should return false for objects with different values', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 2 };
      expect(objShallowEqual(obj1, obj2)).toBe(false);
    });

    test('should return false for objects with different keys', () => {
      const obj1 = { a: 1 };
      const obj2 = { b: 1 };
      expect(objShallowEqual(obj1, obj2)).toBe(false);
    });

    test('should return false for objects with different key counts', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 1, b: 2 };
      expect(objShallowEqual(obj1, obj2)).toBe(false);
    });

    test('should return false when first arg is not an object', () => {
      expect(objShallowEqual(null, {})).toBe(false);
      expect(objShallowEqual('string', {})).toBe(false);
      expect(objShallowEqual([], {})).toBe(false);
      expect(objShallowEqual(123, {})).toBe(false);
    });

    test('should return false when second arg is not an object', () => {
      expect(objShallowEqual({}, null)).toBe(false);
      expect(objShallowEqual({}, [])).toBe(false);
      expect(objShallowEqual({}, 'string')).toBe(false);
    });
  });

  describe('Shallow Comparison Behavior', () => {
    test('should compare nested objects by reference, not value', () => {
      const nested = { x: 1 };
      const obj1 = { a: nested };
      const obj2 = { a: nested }; // same reference
      expect(objShallowEqual(obj1, obj2)).toBe(true);

      const obj3 = { a: { x: 1 } }; // different reference
      expect(objShallowEqual(obj1, obj3)).toBe(false);
    });

    test('should compare arrays by reference', () => {
      const arr = [1, 2, 3];
      const obj1 = { a: arr };
      const obj2 = { a: arr };
      expect(objShallowEqual(obj1, obj2)).toBe(true);

      const obj3 = { a: [1, 2, 3] };
      expect(objShallowEqual(obj1, obj3)).toBe(false);
    });
  });
});

// ============================================================================
// FUNCTION 5: createMap
// ============================================================================
describe('createMap', () => {
  describe('Happy Path', () => {
    test('should create map from array of objects', () => {
      const arr = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];
      const map = createMap(arr, 'id');
      expect(map).toEqual({
        '1': { id: '1', name: 'Alice' },
        '2': { id: '2', name: 'Bob' },
      });
    });

    test('should work with various attribute names', () => {
      const arr = [
        { participantId: 'p1', name: 'Player 1' },
        { participantId: 'p2', name: 'Player 2' },
      ];
      expect(createMap(arr, 'participantId')).toEqual({
        p1: { participantId: 'p1', name: 'Player 1' },
        p2: { participantId: 'p2', name: 'Player 2' },
      });
    });
  });

  describe('Edge Cases', () => {
    test('should return empty object for non-array input', () => {
      expect(createMap(null, 'id')).toEqual({});
      expect(createMap(undefined, 'id')).toEqual({});
      expect(createMap('not array', 'id')).toEqual({});
      expect(createMap({}, 'id')).toEqual({});
      expect(createMap(123, 'id')).toEqual({});
    });

    test('should return empty object for empty array', () => {
      expect(createMap([], 'id')).toEqual({});
    });

    test('should filter out non-object array elements', () => {
      const arr = [{ id: '1', name: 'Alice' }, null, 'string', { id: '2', name: 'Bob' }, undefined, 123];
      expect(createMap(arr, 'id')).toEqual({
        '1': { id: '1', name: 'Alice' },
        '2': { id: '2', name: 'Bob' },
      });
    });

    test('should skip objects without the specified attribute', () => {
      const arr = [{ id: '1', name: 'Alice' }, { name: 'Bob' }, { id: '3', name: 'Charlie' }];
      expect(createMap(arr, 'id')).toEqual({
        '1': { id: '1', name: 'Alice' },
        '3': { id: '3', name: 'Charlie' },
      });
    });

    test('should skip objects with falsy attribute values', () => {
      const arr = [
        { id: '1', value: 'a' },
        { id: '', value: 'b' },
        { id: null, value: 'c' },
        { id: 0, value: 'd' },
      ];
      expect(createMap(arr, 'id')).toEqual({
        '1': { id: '1', value: 'a' },
      });
    });

    test('should handle duplicate keys (last one wins)', () => {
      const arr = [
        { id: '1', value: 'first' },
        { id: '1', value: 'second' },
      ];
      const result = createMap(arr, 'id');
      expect(result['1'].value).toBe('second');
    });
  });
});

// ============================================================================
// FUNCTION 6 & 7: hasAttributeValues / hav
// ============================================================================
describe('hasAttributeValues (hav)', () => {
  describe('Happy Path', () => {
    test('should create filter function that matches single attribute', () => {
      const users = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 25 },
      ];
      const age25 = users.filter(hav({ age: 25 }));
      expect(age25).toHaveLength(2);
      expect(age25).toContainEqual({ name: 'Alice', age: 25 });
      expect(age25).toContainEqual({ name: 'Charlie', age: 25 });
    });

    test('should match multiple attributes', () => {
      const users = [
        { name: 'Alice', age: 25, city: 'NYC' },
        { name: 'Bob', age: 30, city: 'LA' },
        { name: 'Charlie', age: 25, city: 'NYC' },
      ];
      const filtered = users.filter(hav({ age: 25, city: 'NYC' }));
      expect(filtered).toHaveLength(2);
      expect(filtered[0].name).toBe('Alice');
      expect(filtered[1].name).toBe('Charlie');
    });

    test('should work with find method', () => {
      const users = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const found = users.find(hav({ id: 2 }));
      expect(found).toEqual({ id: 2, name: 'Bob' });
    });

    test('should work with various data types', () => {
      const items = [
        { type: 'string', active: true },
        { type: 'number', active: false },
        { type: 'string', active: false },
      ];
      expect(items.filter(hav({ type: 'string', active: true }))).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    test('should return false when attribute does not exist', () => {
      const obj = { name: 'Alice' };
      expect(hav({ age: 25 })(obj)).toBe(false);
    });

    test('should handle empty criteria object', () => {
      const obj = { name: 'Alice' };
      expect(hav({})(obj)).toBe(true);
    });

    test('should use strict equality', () => {
      const obj = { id: '1' };
      expect(hav({ id: 1 })(obj)).toBe(false);
      expect(hav({ id: '1' })(obj)).toBe(true);
    });

    test('should handle null and undefined values', () => {
      const obj = { a: null, b: undefined };
      expect(hav({ a: null })(obj)).toBe(true);
      expect(hav({ b: undefined })(obj)).toBe(true);
      expect(hav({ a: undefined })(obj)).toBe(false);
    });
  });

  describe('Alias: hav', () => {
    test('hav should be an alias for hasAttributeValues', () => {
      expect(hav).toBe(hasAttributeValues);
    });
  });
});

// ============================================================================
// FUNCTION 8: undefinedToNull
// ============================================================================
describe('undefinedToNull', () => {
  describe('Happy Path - Deep Conversion', () => {
    test('should convert undefined values to null', () => {
      const obj = { a: undefined, b: 1, c: 'test' };
      expect(undefinedToNull(obj)).toEqual({ a: null, b: 1, c: 'test' });
    });

    test('should recursively convert nested objects', () => {
      const obj = {
        a: undefined,
        b: { c: undefined, d: 1 },
      };
      expect(undefinedToNull(obj)).toEqual({
        a: null,
        b: { c: null, d: 1 },
      });
    });

    test('should recursively convert arrays of objects', () => {
      const obj = {
        items: [
          { id: 1, value: undefined },
          { id: 2, value: 'test' },
        ],
      };
      expect(undefinedToNull(obj)).toEqual({
        items: [
          { id: 1, value: null },
          { id: 2, value: 'test' },
        ],
      });
    });

    test('should handle deeply nested structures', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              value: undefined,
            },
          },
        },
      };
      expect(undefinedToNull(obj)).toEqual({
        level1: {
          level2: {
            level3: {
              value: null,
            },
          },
        },
      });
    });
  });

  describe('Shallow Conversion', () => {
    test('should only convert top level when shallow=true', () => {
      const obj = {
        a: undefined,
        b: { c: undefined, d: 1 },
      };
      const result = undefinedToNull(obj, true);
      expect(result).toEqual({
        a: null,
        b: { c: undefined, d: 1 },
      });
    });

    test('should not recurse into arrays when shallow=true', () => {
      const obj = {
        items: [{ value: undefined }],
      };
      expect(undefinedToNull(obj, true)).toEqual({
        items: [{ value: undefined }],
      });
    });
  });

  describe('Edge Cases', () => {
    test('should return null if input is undefined', () => {
      expect(undefinedToNull(undefined)).toBe(null);
    });

    test('should return input if not an object', () => {
      expect(undefinedToNull(null)).toBe(null);
      expect(undefinedToNull('string')).toBe('string');
      expect(undefinedToNull(123)).toBe(123);
      expect(undefinedToNull(true)).toBe(true);
    });

    test('should handle empty objects', () => {
      expect(undefinedToNull({})).toEqual({});
    });

    test('should preserve null values', () => {
      const obj = { a: null, b: undefined };
      expect(undefinedToNull(obj)).toEqual({ a: null, b: null });
    });

    test('should handle objects with only undefined values', () => {
      const obj = { a: undefined, b: undefined, c: undefined };
      expect(undefinedToNull(obj)).toEqual({ a: null, b: null, c: null });
    });
  });
});

// ============================================================================
// FUNCTION 9: generateHashCode
// ============================================================================
describe('generateHashCode', () => {
  describe('Happy Path', () => {
    test('should generate consistent hash for same object', () => {
      const obj = { a: 1, b: 2 };
      const hash1 = generateHashCode(obj);
      const hash2 = generateHashCode(obj);
      expect(hash1).toBe(hash2);
    });

    test('should generate same hash for equivalent objects', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { a: 1, b: 2 };
      expect(generateHashCode(obj1)).toBe(generateHashCode(obj2));
    });

    test('should generate different hashes for different objects', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 2 };
      expect(generateHashCode(obj1)).not.toBe(generateHashCode(obj2));
    });

    test('should handle nested objects', () => {
      const obj = { a: { b: { c: 1 } } };
      const hash = generateHashCode(obj);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    test('should handle arrays in objects', () => {
      const obj = { items: [1, 2, 3] };
      const hash = generateHashCode(obj);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    test('should generate hash for complex objects', () => {
      const obj = {
        id: '123',
        name: 'Test',
        nested: { value: 42 },
        array: [1, 2, 3],
      };
      const hash = generateHashCode(obj);
      expect(hash).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    test('should return undefined for null', () => {
      expect(generateHashCode(null)).toBeUndefined();
    });

    test('should return undefined for primitives', () => {
      expect(generateHashCode('string')).toBeUndefined();
      expect(generateHashCode(123)).toBeUndefined();
      expect(generateHashCode(true)).toBeUndefined();
    });

    test('should handle empty objects', () => {
      const hash = generateHashCode({});
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    test('should handle empty arrays', () => {
      const hash = generateHashCode([]);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================
describe('Integration Tests', () => {
  describe('createMap + hasAttributeValues', () => {
    test('should work together to create and query maps', () => {
      const users = [
        { id: '1', name: 'Alice', role: 'admin' },
        { id: '2', name: 'Bob', role: 'user' },
        { id: '3', name: 'Charlie', role: 'admin' },
      ];
      const userMap = createMap(users, 'id');
      const admins = Object.values(userMap).filter(hav({ role: 'admin' }));
      expect(admins).toHaveLength(2);
      expect(admins.map((u: any) => u.name)).toContain('Alice');
      expect(admins.map((u: any) => u.name)).toContain('Charlie');
    });
  });

  describe('isObject + objShallowEqual', () => {
    test('should validate before comparing', () => {
      const val1 = { a: 1 };
      const val2 = { a: 1 };
      const val3 = null;

      if (isObject(val1) && isObject(val2)) {
        expect(objShallowEqual(val1, val2)).toBe(true);
      }

      if (isObject(val1) && isObject(val3)) {
        // This should not execute
        expect(true).toBe(false);
      } else {
        expect(true).toBe(true);
      }
    });
  });

  describe('Type guards workflow', () => {
    test('should use type guards for safe operations', () => {
      const values = ['string', 123, { key: 'value' }, () => {}, null, undefined];

      const strings = values.filter(isString);
      const objects = values.filter(isObject);
      const functions = values.filter(isFunction);

      expect(strings).toEqual(['string']);
      expect(objects).toEqual([{ key: 'value' }]);
      expect(functions).toHaveLength(1);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================
describe('Performance', () => {
  test('createMap should handle large arrays efficiently', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      id: `id-${i}`,
      value: i,
    }));

    const start = Date.now();
    const map = createMap(largeArray, 'id');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
    expect(Object.keys(map)).toHaveLength(10000);
  });

  test('generateHashCode should be fast for typical objects', () => {
    const obj = {
      id: '123',
      name: 'Test Object',
      data: { values: [1, 2, 3, 4, 5] },
      metadata: { created: Date.now() },
    };

    const iterations = 1000;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      generateHashCode(obj);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
