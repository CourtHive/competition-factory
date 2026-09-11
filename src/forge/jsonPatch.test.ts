import { describe, expect, it } from 'vitest';

import { generatePatch, JsonPatch } from './jsonPatch';

describe('generatePatch — RFC 6902 generator', () => {
  it('returns an empty patch for identical values', () => {
    expect(generatePatch(1, 1)).toEqual([]);
    expect(generatePatch('a', 'a')).toEqual([]);
    expect(generatePatch(null, null)).toEqual([]);
    expect(generatePatch({ a: 1 }, { a: 1 })).toEqual([]);
    expect(generatePatch([1, 2], [1, 2])).toEqual([]);
  });

  it('replaces a scalar at the root', () => {
    expect(generatePatch(1, 2)).toEqual([{ op: 'replace', path: '', value: 2 }]);
  });

  it('replaces a leaf scalar inside an object', () => {
    expect(generatePatch({ a: 1 }, { a: 2 })).toEqual([{ op: 'replace', path: '/a', value: 2 }]);
  });

  it('adds a new object key', () => {
    expect(generatePatch({ a: 1 }, { a: 1, b: 2 })).toEqual([{ op: 'add', path: '/b', value: 2 }]);
  });

  it('removes a missing object key', () => {
    expect(generatePatch({ a: 1, b: 2 }, { a: 1 })).toEqual([{ op: 'remove', path: '/b' }]);
  });

  it('emits add at the tail when array grows', () => {
    expect(generatePatch([1, 2], [1, 2, 3])).toEqual([{ op: 'add', path: '/2', value: 3 }]);
  });

  it('emits removes from the tail (highest-index-first) when array shrinks', () => {
    expect(generatePatch([1, 2, 3, 4], [1, 2])).toEqual([
      { op: 'remove', path: '/3' },
      { op: 'remove', path: '/2' },
    ]);
  });

  it('replaces array entries in place', () => {
    expect(generatePatch([1, 2, 3], [1, 9, 3])).toEqual([{ op: 'replace', path: '/1', value: 9 }]);
  });

  it('handles array-to-object and object-to-array swap as wholesale replace', () => {
    expect(generatePatch([1, 2], { a: 1 })).toEqual([{ op: 'replace', path: '', value: { a: 1 } }]);
    expect(generatePatch({ a: 1 }, [1, 2])).toEqual([{ op: 'replace', path: '', value: [1, 2] }]);
  });

  it('escapes `~` and `/` in keys per RFC 6901', () => {
    const patch = generatePatch({ 'a/b': 1, 'c~d': 2 }, { 'a/b': 9, 'c~d': 9 });
    expect(patch).toEqual([
      { op: 'replace', path: '/a~1b', value: 9 },
      { op: 'replace', path: '/c~0d', value: 9 },
    ]);
  });

  it('handles deeply nested differences', () => {
    const before = { tournament: { events: [{ eventId: 'e1', name: 'old' }] } };
    const after = { tournament: { events: [{ eventId: 'e1', name: 'new' }] } };
    expect(generatePatch(before, after)).toEqual([{ op: 'replace', path: '/tournament/events/0/name', value: 'new' }]);
  });

  it('emits multiple ops for mixed adds/removes/replaces in a single tree', () => {
    const before = { a: 1, b: 2, list: [10, 20, 30] };
    const after = { a: 1, b: 99, c: 'new', list: [10, 21] };
    const patch = generatePatch(before, after);
    expect(patch).toEqual(
      expect.arrayContaining([
        { op: 'replace', path: '/b', value: 99 },
        { op: 'add', path: '/c', value: 'new' },
        { op: 'replace', path: '/list/1', value: 21 },
        { op: 'remove', path: '/list/2' },
      ]),
    );
    expect(patch).toHaveLength(4);
  });

  it('NaN compares equal to NaN (no spurious replace)', () => {
    expect(generatePatch({ x: NaN }, { x: NaN })).toEqual([]);
  });

  it('null vs undefined are distinguished — null replaces undefined and vice versa', () => {
    expect(generatePatch({ a: undefined }, { a: null })).toEqual([{ op: 'replace', path: '/a', value: null }]);
  });

  it('object with explicit `undefined` value treats it as present — replace, not remove', () => {
    // Note: JSON serialization would drop `undefined`, but JS-level diff
    // treats `{ a: undefined }` as having key `a`. Documented edge case.
    const patch: JsonPatch = generatePatch({ a: 1 }, { a: undefined });
    expect(patch).toEqual([{ op: 'replace', path: '/a', value: undefined }]);
  });

  it('produces an applicable patch — apply round-trips to `after`', () => {
    // Tiny inline applier so we don't depend on a JSON-patch lib in tests.
    function apply<T>(value: T, patch: JsonPatch): T {
      let root: any = value === null || typeof value !== 'object' ? value : structuredClone(value);
      for (const opEntry of patch) {
        if (opEntry.path === '') {
          // Root replacement
          root = (opEntry as { value: any }).value;
          continue;
        }
        const segments = opEntry.path
          .split('/')
          .slice(1)
          .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
        const last = segments.pop()!;
        let cursor: any = root;
        for (const seg of segments) cursor = Array.isArray(cursor) ? cursor[+seg] : cursor[seg];
        if (opEntry.op === 'add' || opEntry.op === 'replace') {
          if (Array.isArray(cursor)) cursor[+last] = opEntry.value;
          else cursor[last] = opEntry.value;
        } else {
          if (Array.isArray(cursor)) cursor.splice(+last, 1);
          else delete cursor[last];
        }
      }
      return root;
    }

    const before = {
      tournament: {
        events: [
          { eventId: 'e1', name: 'Singles' },
          { eventId: 'e2', name: 'Doubles' },
        ],
        venues: [{ venueId: 'v1' }],
      },
      newKey: undefined,
    };
    const after = {
      tournament: {
        events: [
          { eventId: 'e1', name: 'Singles 2026' },
          { eventId: 'e2', name: 'Doubles' },
          { eventId: 'e3', name: 'Mixed' },
        ],
      },
      added: true,
    };
    const patch = generatePatch(before, after);
    const result = apply(before, patch);
    expect(result).toEqual(after);
  });
});
