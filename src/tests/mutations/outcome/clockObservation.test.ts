import { nowIso, nowMs, observeClockReads, setClock } from '@Tools/clock';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  setClock();
  vi.restoreAllMocks();
});

it('records a throw from the default source without replacing the original error', () => {
  const failure = new Error('default source');
  vi.spyOn(Date, 'now').mockImplementation(() => {
    throw failure;
  });
  const readings: unknown[] = [],
    observerErrors: unknown[] = [];
  let thrown: unknown;
  try {
    observeClockReads(
      () => (reading) => readings.push(reading),
      () => nowMs(),
      observerErrors,
    );
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(failure);
  expect(readings).toEqual([{ thrown: failure }]);
  expect(observerErrors).toEqual([]);
});

it('observes each actual read, including untagged failures, and releases nested observers', () => {
  const target = {};
  const observerErrors: unknown[] = [];
  const effects: unknown[] = [];
  const readings: unknown[] = [];
  const nested: unknown[] = [];
  let reads = 0;
  setClock(() => {
    reads++;
    if (reads === 2) throw new Error('second occurrence');
    return reads * 1000;
  });
  expect(() =>
    observeClockReads(
      (effect) => {
        effects.push(effect);
        return (reading) => readings.push(reading);
      },
      () => {
        expect(nowMs({ kind: 'updatedAt', target })).toBe(1000);
        observeClockReads(
          () => (reading) => nested.push(reading),
          () => nowIso(),
          observerErrors,
        );
      },
      observerErrors,
    ),
  ).toThrow('second occurrence');
  expect(observerErrors).toEqual([]);
  expect(reads).toBe(2);
  expect(effects).toEqual([{ kind: 'updatedAt', target }, undefined]);
  expect(readings[0]).toEqual({ ms: 1000 });
  expect(readings[1]).toMatchObject({ message: 'the configured clock threw: second occurrence' });
  expect(nested).toEqual([readings[1]]);
  expect(nowMs()).toBe(3000);
  expect(readings).toHaveLength(2);
  expect(nested).toHaveLength(1);
});

it('observer failures neither suppress source reads nor replace their result', () => {
  const errors: unknown[] = [];
  let reads = 0;
  setClock(() => ++reads * 1000);
  const fail = () => {
    throw new Error('observer failed');
  };
  expect(observeClockReads(fail, () => nowMs(), errors)).toBe(1000);
  expect(
    observeClockReads(
      () => fail,
      () => nowMs(),
      errors,
    ),
  ).toBe(2000);
  expect(reads).toBe(2);
  expect(errors).toHaveLength(2);
});
