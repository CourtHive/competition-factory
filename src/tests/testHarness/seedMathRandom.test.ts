import { expect, it } from 'vitest';

/**
 * `Math.random` IS SEEDED PER TEST — see `seedMathRandom.ts`.
 *
 * The first case pins the first draw for THIS test to a constant. If the seeding stopped running,
 * or the hash or the PRNG changed, the constant would change and this would say so. The second
 * shows the property the seeding exists for: two tests with different names draw different numbers,
 * and each draws the same numbers every run.
 */

it('draws the same first number on every run', () => {
  expect(Math.random()).toBe(0.7853402660693973);
});

it('draws a different sequence under a different name', () => {
  const first = Math.random();
  expect(first).not.toBe(0.7853402660693973);
  expect(first).toBe(0.4861141578294337);
});
