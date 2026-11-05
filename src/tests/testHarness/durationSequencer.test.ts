import { assignShards } from '../../../vitest.sequencer.mjs';
import { expect, it } from 'vitest';

const durations = { 'a.test.ts': 100, 'b.test.ts': 60, 'c.test.ts': 50, 'd.test.ts': 10, 'e.test.ts': 0.1 };
const paths = Object.keys(durations);

it('places every file on exactly one shard', () => {
  const shards = assignShards(paths, 3, durations);
  expect(shards.flat().sort()).toEqual([...paths].sort());
});

it('balances by duration, heaviest first onto the least-loaded shard', () => {
  // a (100) opens shard 1, b (60) shard 2; c (50) joins the lighter shard 2 (110), d (30) the lighter shard 1 (130)
  const weights = { 'a.test.ts': 100, 'b.test.ts': 60, 'c.test.ts': 50, 'd.test.ts': 30 };
  expect(assignShards(Object.keys(weights), 2, weights)).toEqual([
    ['a.test.ts', 'd.test.ts'],
    ['b.test.ts', 'c.test.ts'],
  ]);
});

it('assigns the same way whatever order the files arrive in', () => {
  expect(assignShards([...paths].reverse(), 3, durations)).toEqual(assignShards(paths, 3, durations));
});

it('weighs a file with no recorded duration as a light one, never drops it', () => {
  const shards = assignShards([...paths, 'new.test.ts'], 2, durations);
  expect(shards.flat()).toContain('new.test.ts');
});

it('leaves extra shards empty rather than failing when files are fewer than shards', () => {
  expect(assignShards(['only.test.ts'], 3, {})).toEqual([['only.test.ts'], [], []]);
});
