/**
 * Why a shootout's final tally could not have happened (Ruling 3, CA 2026-11-04), or undefined when it could.
 * `-F:SO{n}` is entered as a tally only: a shootout is never level when it ends, and past its n rounds it is
 * sudden death, so a side above n won by exactly one. Attempt-by-attempt entry is a later slice that reduces to the
 * same tally.
 */
export function shootoutTallyRefusal(rounds: number, [a, b]: [number, number]): string | undefined {
  if (![a, b].every((goals) => Number.isSafeInteger(goals) && goals >= 0))
    return 'a shootout tally is whole goals for each side';
  if (a === b) return 'a shootout does not end level';
  if (Math.max(a, b) > rounds && Math.abs(a - b) !== 1)
    return `past its ${rounds} rounds a shootout is sudden death: it is won by one`;
  return undefined;
}
