import { getCallRandomSource, setCallRandomSource } from '@Global/state/globalState';

// constants
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export type RandomFunction = () => number;

/** Thrown, never returned: a draw has no result to carry an error. An engine call reports it as `{ error }`. */
export const DEGENERATE_RANDOM_SOURCE = 'DEGENERATE_RANDOM_SOURCE';
export type SeededRandom = RandomFunction & { seed?: number; state?: () => number };

// mulberry32: a fast, simple seeded 32-bit PRNG with good distribution
export function createSeededRandom(seed: number): SeededRandom {
  let state = Math.trunc(seed);
  const rng = () => {
    state = Math.trunc(state + 0x6d2b79f5);
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // The seed rides along so a recorded directive can be written back as `nonRandom: <seed>`
  // after engineInvoke has turned it into this function. `state()` is the generator's current
  // internal state: mulberry32's next value depends on nothing else, so
  // `createSeededRandom(state())` continues this exact stream. The corpus recorder uses it to
  // record a seed for the mutations that follow without disturbing the stream a test is using.
  const tagged = rng as SeededRandom;
  tagged.seed = Math.trunc(seed);
  tagged.state = () => state;
  return tagged;
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
    // Wrapped, so a value outside [0, 1) is refused at the draw instead of becoming a wrong index,
    // and so each call starts a new stream: re-setting the same function restarts UUID's repeat
    // window with it (see refuseRepeatedId in UUID.ts).
    configuredSource = () => {
      const value = source();
      if (!(value >= 0 && value < 1)) throw new Error(`${DEGENERATE_RANDOM_SOURCE}: returned ${value}, not in [0, 1)`);
      return value;
    };
    return { ...SUCCESS };
  }
  return { error: INVALID_VALUES, info: 'random source must be a seed (finite number) or a () => number' };
}

/**
 * Runs `fn` against a FORK of the configured seeded source, then reinstates the original untouched.
 *
 * WHY a fork and not a rewind: a preview (dryRun) must leave the stream where it found it, so that
 * the commit which follows draws exactly what the preview showed. Rewinding the ORIGINAL in place
 * would re-mint the preview's ids from the same function, and `UUID` refuses an id that function
 * has already minted (`refuseRepeatedId`, keyed by function). The fork records its ids under its
 * own key; the original never sees them.
 *
 * Only a seeded source (`setRandomSource(seed)`) exposes its `state()`. A caller-supplied function
 * and `Math.random` are opaque: they cannot be forked, and a preview advances them.
 */
export function withForkedRandomSource<T>(fn: () => T): T {
  const original = configuredSource as SeededRandom | undefined;
  if (typeof original?.state !== 'function') return fn();

  configuredSource = createSeededRandom(original.state());
  try {
    return fn();
  } finally {
    configuredSource = original;
  }
}

/**
 * A second seeded stream derived from `seed`, independent of `createSeededRandom(seed)`.
 *
 * For draws a seed must determine WITHOUT taking them from the seed's own stream: adding a draw to
 * that stream shifts every later one, which would change what every existing seed produces (census
 * seeds, frozen arms and the tests pinned to them). `purpose` separates one derived stream from
 * another. FNV-1a over the seed and purpose, so any finite number works as a seed.
 */
export function createDerivedRandom(seed: number, purpose: string): SeededRandom {
  const text = `${seed}:${purpose}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return createSeededRandom(hash >>> 0);
}

/**
 * Runs `fn` with `source` as the configured source, then reinstates the previous one.
 *
 * WHY: a mocksEngine call's `nonRandom` seed names its record only if EVERY draw is determined by it.
 * The mocks' own generators take the seeded `random`, but generation also runs draw, venue,
 * tieFormat and id code that reads the configured source (68 bare `UUID()` sites, 2026-10-17). The
 * mocks wrapper scopes a stream DERIVED from the seed here (`createDerivedRandom`), so those draws
 * are determined by the seed too, whatever the process's source is and whatever ran before, while
 * the seed's own stream keeps exactly the draws it always had. Without a function `fn` runs against
 * the configured source unchanged.
 */
export function withRandomSource<T>(source: RandomFunction | undefined, fn: () => T): T {
  if (typeof source !== 'function') return fn();
  const previous = configuredSource;
  configuredSource = source;
  try {
    return fn();
  } finally {
    configuredSource = previous;
  }
}

/**
 * Runs `fn` with `source` as the CALL's stream, held in the global state provider, then reinstates the previous one.
 *
 * WHY: an engine call's `nonRandom` seed reached only the code that takes its `random` parameter. Everything that
 * reads the configured source instead, every bare `UUID()` among it, drew from the process: a seeded
 * `generateDrawDefinition` placed the same participants every time and minted different ids every time (measured
 * 2026-10-18: 0 of 31 matchUpIds alike across two runs). The engines now scope a stream DERIVED from the seed
 * here, as the mocksEngine does with `withRandomSource`, so the seed's own stream keeps exactly the draws it always
 * had and what it did not determine now is.
 *
 * Per call and in the provider, not process-wide like `withRandomSource`: the async engine awaits inside a call,
 * and a process-wide source would hand one request's stream to every request running concurrently with it. A
 * provider without the hooks scopes nothing (globalState `getCallRandomSource`). Without a function `fn` runs
 * unchanged.
 */
export function withCallRandomSource<T>(source: RandomFunction | undefined, fn: () => T): T {
  if (typeof source !== 'function') return fn();
  const previous = getCallRandomSource();
  setCallRandomSource(source);
  try {
    return fn();
  } finally {
    setCallRandomSource(previous);
  }
}

/** `withCallRandomSource` for an async `fn`: the stream is released only once `fn` settles. */
export async function withCallRandomSourceAsync<T>(
  source: RandomFunction | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (typeof source !== 'function') return fn();
  const previous = getCallRandomSource();
  setCallRandomSource(source);
  try {
    return await fn();
  } finally {
    setCallRandomSource(previous);
  }
}

/**
 * The function to draw randomness from right now: a seeded call's stream, then the configured source, then
 * `Math.random`. Read at the call, never captured at import.
 */
export function randomSource(): RandomFunction {
  return getCallRandomSource() ?? configuredSource ?? Math.random;
}
