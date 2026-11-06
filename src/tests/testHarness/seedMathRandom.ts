import { testRandomSeed } from './testRandomSeed';
import { createSeededRandom } from '@Tools/prng';
import { beforeEach, expect } from 'vitest';
import { relative } from 'node:path';

/**
 * EVERY TEST GETS THE SAME `Math.random` EVERY RUN.
 *
 * The engine reaches `Math.random` in fifteen places — the mocks' scores and draw positions, BYE
 * placement, UUIDs, ad hoc pairings — and a test that generates without `nonRandom` takes whichever
 * path that run's numbers choose. Measured 2026-09-30, two coverage runs of one tree: 5 statements
 * in 3 files covered in one run and not the other (`generateOutcome`, `keyValueScore`,
 * `assignDrawPositionQualifier`), and the headroom `verify:coverage-headroom` reports moved with them.
 * That noise is what put the 7.3.0 publish one item under its line (assessment gap G10).
 *
 * So before each test `Math.random` becomes a seeded PRNG whose seed is the test's own path and
 * name. A test still gets numbers that look random and differ from every other test's; it gets the
 * SAME numbers on every run, on every machine. A test that wants real entropy can restore
 * `Math.random` itself, and one that asserts two draws DIFFER still passes, because two calls to a
 * PRNG differ too.
 *
 * `nonRandom` is untouched: the mocks' own seeded generator is what a scenario's seed means, and
 * this does not stand in for it.
 */
// `it.each` rows can share one name — `roundRobinSeededByePlacement` runs five under a single
// title and asserts that their BYE placements DIFFER — so the seed also counts how many times a
// name has run in this file. Still deterministic: the fourth row is always the fourth row.
const runsByName = new Map<string, number>();

let current: { name: string; ordinal: number; seed: number } | undefined;

type SeedIdentity = { name: string; ordinal: number };
const seedIdentities = new Map<string, (title: string, ordinal: number) => SeedIdentity>();

/** Register a relocated test's seed identity before any setup hook observes its diagnostics. */
export function registerTestSeedIdentity(file: string, identity: (title: string, ordinal: number) => SeedIdentity) {
  seedIdentities.set(file, identity);
}

/** Reseed both the effective RNG and its replay diagnostics without changing the Vitest task identity. */
export function setTestRandomSeed(name: string, ordinal: number) {
  const seed = testRandomSeed(name, ordinal);
  current = { name, ordinal, seed };
  Math.random = createSeededRandom(seed);
}

/** The seed and identity of the test currently running, for the corpus recorder. */
export function currentTestSeed() {
  return current;
}

beforeEach(() => {
  const { testPath, currentTestName } = expect.getState();
  // relative to the repo, so the seed is the same on every machine and in CI
  const file = relative(process.cwd(), testPath ?? '');
  const name = `${file}::${currentTestName ?? ''}`;
  const ordinal = (runsByName.get(name) ?? 0) + 1;
  runsByName.set(name, ordinal);
  const identity = seedIdentities.get(file)?.(currentTestName ?? '', ordinal);
  setTestRandomSeed(identity?.name ?? name, identity?.ordinal ?? ordinal);
});
