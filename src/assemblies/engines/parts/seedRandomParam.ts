import { createDerivedRandom, createSeededRandom, type RandomFunction } from '@Tools/prng';

/**
 * The `nonRandom: <seed>` transform, shared by every engine entry point: a numeric seed on a call
 * becomes that call's own seeded `random` function, which outranks the configured source.
 *
 * ONE copy on purpose. It lived inline in the sync engine's `engineInvoke` and `executionQueue`
 * and in mocksEngine, and the async engine had none, so `nonRandom` was ignored by the engine
 * the server runs while the client, replaying the same directive with the sync engine, honoured
 * it (randomnessExamples.test.ts › "the async engine applies nonRandom").
 *
 * `params` must be the caller's own copy: the seed is replaced in place, and removed so that a
 * nested dispatch does not seed a second, fresh stream.
 */
export function seedRandomParam<T extends object>(params: T): T {
  const seedable = params as { nonRandom?: unknown; random?: RandomFunction };
  if (typeof seedable.nonRandom === 'number') {
    seedable.random = createSeededRandom(seedable.nonRandom);
    delete seedable.nonRandom;
  }
  return params;
}

/**
 * `seedRandomParam` for an engine call, returning the stream for the draws the seed does not reach through `random`
 * (a bare `UUID()` reads the configured source). Derived BEFORE the seed is consumed, from the same seed and
 * purpose as the mocksEngine's, so the seed's own stream keeps exactly the draws it always had. The caller scopes
 * the returned stream around the call with `withCallRandomSource`; undefined when the call is not seeded.
 */
export function seedCall(params: object): RandomFunction | undefined {
  const seed = (params as { nonRandom?: unknown }).nonRandom;
  const unthreaded = typeof seed === 'number' ? createDerivedRandom(seed, 'unthreaded') : undefined;
  seedRandomParam(params);
  return unthreaded;
}
