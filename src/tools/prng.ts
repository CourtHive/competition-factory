// constants
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export type RandomFunction = () => number;

// mulberry32: a fast, simple seeded 32-bit PRNG with good distribution
export function createSeededRandom(seed: number): RandomFunction {
  let state = Math.trunc(seed);
  return () => {
    state = Math.trunc(state + 0x6d2b79f5);
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The engine's source of randomness, process-wide.
 *
 * Every site that used to read `Math.random` directly reads `randomSource()` instead, and every
 * one of them still honours an explicit `random` parameter first (the `nonRandom: <seed>`
 * middleware in `engineInvoke` passes one per call). So the precedence is: the call's own
 * `random` → the source configured here → `Math.random`.
 *
 * WHY: ids come from `UUID()`, and `UUID()` fell back to `Math.random`, so two generations of
 * one mocks seed differed at the tournamentId. Under vitest that was masked by
 * `seedMathRandom.ts`; outside vitest a corpus generator could not reproduce its own output.
 * `setRandomSource(seed)` makes a run reproducible without patching a global.
 *
 * Process-wide on purpose: like `schemaWriteMode`, it is a run configuration, not request state.
 * `setRandomSource()` with no argument restores `Math.random`.
 */
let configuredSource: RandomFunction | undefined;

export function setRandomSource(source?: RandomFunction | number): {
  success?: boolean;
  error?: ErrorType;
  info?: string;
} {
  if (source === undefined) {
    configuredSource = undefined;
    return { ...SUCCESS };
  }
  if (typeof source === 'number' && Number.isFinite(source)) {
    configuredSource = createSeededRandom(source);
    return { ...SUCCESS };
  }
  if (typeof source === 'function') {
    configuredSource = source;
    return { ...SUCCESS };
  }
  return { error: INVALID_VALUES, info: 'random source must be a seed (finite number) or a () => number' };
}

/** The function to draw randomness from right now. Read at the call, never captured at import. */
export function randomSource(): RandomFunction {
  return configuredSource ?? Math.random;
}
