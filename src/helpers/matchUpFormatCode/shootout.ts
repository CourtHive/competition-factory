/**
 * Why a shootout's final tally could not have happened (Ruling 3, CA 2026-11-04), or undefined when it could.
 * `-F:SO{n}` is entered as a tally only: a shootout is never level when it ends, and past its n rounds it is
 * sudden death, so a side above n won by exactly one; within n it ends as soon as one side cannot catch up. Attempt-by-attempt entry is a later slice that reduces to the
 * same tally.
 */
export function shootoutTallyRefusal(rounds: number, [a, b]: [number, number]): string | undefined {
  if (![a, b].every((goals) => Number.isSafeInteger(goals) && goals >= 0))
    return 'a shootout tally is whole goals for each side';
  if (a === b) return 'a shootout does not end level';
  const [won, lost] = a > b ? [a, b] : [b, a];
  if (won > rounds)
    return won - lost === 1 ? undefined : `past its ${rounds} rounds a shootout is sudden death: it is won by one`;
  // within its rounds a shootout ends the moment one side cannot catch up: the loser then has taken
  // rounds - (won - lost) + 1 attempts, and the winner at most one more
  if (2 * won - lost > rounds + 2)
    return `a shootout ends once one side cannot catch up: ${won}-${lost} is past that in ${rounds} rounds`;
  return undefined;
}
