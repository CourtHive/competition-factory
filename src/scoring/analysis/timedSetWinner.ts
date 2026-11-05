import type { Set as SetType } from '@Types/tournamentTypes';

/**
 * True when a timed set names a winner its own score contradicts.
 *
 * A timed set has no `setTo`, so every set-score check that reads one passed it untouched: a set scored
 * 10-11 could be recorded as won by side 1. On the clock the side ahead when time runs out takes the set,
 * so a winner holding FEWER points than the other side is impossible. A level score is not judged here: a
 * tiebreak or the aggregate decides it, and those are asked elsewhere.
 */
export function timedSetWinnerContradicts(set?: SetType): boolean {
  const { side1Score, side2Score, winningSide } = set ?? {};
  if (winningSide !== 1 && winningSide !== 2) return false;
  if (typeof side1Score !== 'number' || typeof side2Score !== 'number' || side1Score === side2Score) return false;
  return (side1Score > side2Score ? 1 : 2) !== winningSide;
}
