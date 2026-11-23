import { captureRecord, compareRecord } from '@Tools/recordDiff';
import { expect, it } from 'vitest';

it('captures values before the original is mutated and reports an escaped JSON Pointer', () => {
  const record = { events: [{ 'notes/~': 'before' }] };
  const before = captureRecord(record);
  record.events[0]['notes/~'] = 'after';
  expect(compareRecord(before, record)).toEqual({
    equal: false,
    firstDifference: { op: 'replace', path: '/events/0/notes~1~0', value: 'after' },
  });
});

it('compares canonical JSON without dropping timestamps or factory versions', () => {
  const before = captureRecord({ updatedAt: '1', factory: { version: '1' }, notes: undefined });
  expect(compareRecord(before, { factory: { version: '1' }, updatedAt: '1' })).toEqual({ equal: true });
  expect(compareRecord(before, { factory: { version: '1' }, updatedAt: '2' }).firstDifference?.path).toEqual(
    '/updatedAt',
  );
  expect(compareRecord(before, { updatedAt: '1', factory: { version: '2' } }).firstDifference?.path).toEqual(
    '/factory/version',
  );
});

it('can diff a changed record containing sparse positional arrays', () => {
  const positions = new Array(2);
  positions[1] = 4;
  const before = captureRecord({ positions, notes: 'before' });
  expect(compareRecord(before, { positions: [null, 4], notes: 'after' })).toEqual({
    equal: false,
    firstDifference: { op: 'replace', path: '/notes', value: 'after' },
  });
});

it.each([
  [{ entries: [] }, { entries: [{ participantId: 'p1' }] }, '/entries/0'],
  [{ notes: 'kept' }, {}, '/notes'],
  [{ schedule: { courtId: 'c1' } }, { schedule: { courtId: 'c2' } }, '/schedule/courtId'],
  [{ tieMatchUps: [{ notes: 'kept' }] }, { tieMatchUps: [{ notes: 'lost' }] }, '/tieMatchUps/0/notes'],
  [{ extensions: [{ value: [1, 2] }] }, { extensions: [{ value: [2, 1] }] }, '/extensions/0/value/0'],
])('detects additions, removals and nested changes: %j', (before, after, path) => {
  expect(compareRecord(captureRecord(before), after).equal).toEqual(false);
  expect(compareRecord(captureRecord(before), after).firstDifference?.path).toEqual(path);
});
