import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A SINGLE exit — one side is out and the other advances.
 *
 * **This deliberately EXCLUDES `DOUBLE_WALKOVER` / `DOUBLE_DEFAULT`**, which is correct for the
 * advancement questions it was written for and a trap for every other one. It has cost three
 * sessions in the exit-propagation workstream, because the double exits are exactly the statuses
 * that stamp provenance — so a liveness or residue check built on this predicate silently filters
 * out the thing it exists to find. When the question is "is this matchUp an exit at all", use
 * {@link isAnyExit}.
 */
export function isExit(matchUpStatus: any): boolean {
  return [DEFAULTED, WALKOVER, RETIRED].includes(matchUpStatus);
}

/** Any exit, single or double — the predicate to use when asking whether a matchUp was played out. */
export function isAnyExit(matchUpStatus: any): boolean {
  return isExit(matchUpStatus) || [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus);
}
