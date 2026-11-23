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

/**
 * A DOUBLE exit — neither side advances, and the statuses that stamp exit provenance.
 *
 * The third member of this family, added because its absence was being filled by
 * `=== DOUBLE_WALKOVER` at sites that meant "is this a double exit". Measured over the 600-seed
 * sweep window, a `DOUBLE_DEFAULT` reaches three such sites and takes the wrong branch at each:
 * `noDownstreamDependencies` 1303 times, `hasPropagatedExitDownstream` 161, `doubleExitAdvancement`
 * 14. That asymmetry is the drift `doubleExitStatusParity` exists to police.
 */
export function isDoubleExit(matchUpStatus: any): boolean {
  return [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus);
}
