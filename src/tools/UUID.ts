/*
  based on an answer provided by Jeff Ward on StackOverflow; November 2019
  https://stackoverflow.com/users/1026023/jeff-ward
  https://stackoverflow.com/questions/105034/how-to-create-guid-uuid?rq=1
*/

import { DEGENERATE_RANDOM_SOURCE, randomSource, type RandomFunction } from '@Tools/prng';
import { generateRange } from './arrays';

// constants
import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';

type TakeUUIDArgs = {
  /**
   * Caller-supplied pool. `undefined` means "no pool supplied" (mint freely);
   * an EMPTY array means "a pool was supplied and is exhausted" — an error, not
   * a licence to mint.
   */
  uuids?: string[];
  prefix?: string;
};

/**
 * Draw an id from a caller-supplied pool, or mint one when no pool was supplied.
 *
 * STRICT WHEN SUPPLIED. `uuids?.pop() ?? UUID()` silently mints once the pool
 * runs dry, which is the wrong behaviour for replay: the whole point of a pool is
 * that the ORIGIN decides identity and every replaying instance reproduces it.
 * A pool that runs short means the replay needed a different NUMBER of ids than
 * the origin did — i.e. the two instances' states have diverged. Falling back to
 * a fresh UUID converts that detectable divergence into silent, permanent id
 * mismatch; returning an error surfaces it as the conflict it actually is.
 *
 * So: pool absent → mint. Pool present with entries → draw. Pool present and
 * empty → `INSUFFICIENT_UUIDS`.
 *
 * See `Mentat/planning/DISCONNECTED_SYNC_RECONCILIATION.md` §4.1.
 */
export function takeUUID({ uuids, prefix }: TakeUUIDArgs): { uuid?: string; error?: typeof INSUFFICIENT_UUIDS } {
  if (uuids === undefined) return { uuid: UUID(prefix) };

  const uuid = uuids.pop();
  if (uuid === undefined) return { error: INSUFFICIENT_UUIDS };
  return { uuid };
}

/**
 * generate a given number of UUIDs
 *
 * @param {number} count - number of UUIDs to generate
 */
export function UUIDS(count = 1, pre?, random?: () => number) {
  return generateRange(0, count).map(() => UUID(pre, random));
}

/**
 * A SOURCE THAT REPEATS IS REFUSED, AT THE MINT.
 *
 * Every lookup in the factory assumes ids are unique, so a source that repeats mints ids that are
 * not. Measured 2026-10-14 under `setRandomSource(() => 0.5)`: every matchUpId of a draw was the
 * same, `positionTargets` resolved a matchUp's winner matchUp to the matchUp itself, and BYE
 * advancement (advanceDrawPosition <-> assignDrawPositionBye) recursed until the stack overflowed.
 * A longer cycle need not crash: it can collide two ids and build a wrong draw silently.
 *
 * A working source never repeats four 32-bit draws, so a repeat within one stream is proof, with no
 * false positives. The window is per stream (per function): a restarted stream, a new seed, or
 * `nonRandom` on a call is a new function and repeats its ids legitimately — that is what
 * reproducibility means. Bounded, so a long-lived process does not grow it without limit.
 */
const REPEAT_WINDOW = 4096;
const recentIds = new WeakMap<RandomFunction, Set<string>>();

function refuseRepeatedId(rng: RandomFunction, uuid: string) {
  let recent = recentIds.get(rng);
  if (!recent) {
    recent = new Set();
    recentIds.set(rng, recent);
  }
  if (recent.has(uuid)) throw new Error(`${DEGENERATE_RANDOM_SOURCE}: the random source minted ${uuid} twice`);
  recent.add(uuid);
  if (recent.size > REPEAT_WINDOW) recent.delete(recent.values().next().value as string);
}

export function UUID(pre?, random?: () => number) {
  const rng = random ?? randomSource();
  const lut: string[] = [];

  for (let i = 0; i < 256; i++) {
    lut[i] = (i < 16 ? '0' : '') + i.toString(16);
  }

  const d0 = Math.trunc(rng() * 0xffffffff);

  const d1 = Math.trunc(rng() * 0xffffffff);

  const d2 = Math.trunc(rng() * 0xffffffff);

  const d3 = Math.trunc(rng() * 0xffffffff);

  const uuid =
    lut[d0 & 0xff] +
    lut[(d0 >> 8) & 0xff] +
    lut[(d0 >> 16) & 0xff] +
    lut[(d0 >> 24) & 0xff] +
    '-' +
    lut[d1 & 0xff] +
    lut[(d1 >> 8) & 0xff] +
    '-' +
    lut[((d1 >> 16) & 0x0f) | 0x40] +
    lut[(d1 >> 24) & 0xff] +
    '-' +
    lut[(d2 & 0x3f) | 0x80] +
    lut[(d2 >> 8) & 0xff] +
    '-' +
    lut[(d2 >> 16) & 0xff] +
    lut[(d2 >> 24) & 0xff] +
    lut[d3 & 0xff] +
    lut[(d3 >> 8) & 0xff] +
    lut[(d3 >> 16) & 0xff] +
    lut[(d3 >> 24) & 0xff];

  refuseRepeatedId(rng, uuid);

  return typeof pre === 'string' ? `${pre}_${uuid.replaceAll('-', '')}` : uuid;
}
