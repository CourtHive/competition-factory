import type { MatchUp } from '@Types/tournamentTypes';

/**
 * The matchUps of a list that are not tieMatchUps.
 *
 * In context, a TEAM matchUp's tieMatchUps carry its `structureId`, `roundNumber`, `drawPositions` and side
 * drawPositions, and the tie-inclusive getters (`getAllStructureMatchUps`, `allDrawMatchUps`,
 * `getMatchUpsMap().drawMatchUps`) return them beside it. Anything that counts, ranges or `every()`s over such a
 * list as a draw's matchUps must read it through this, or a rubber reads as a matchUp: a rubber won counted as a
 * prior win, a WALKOVER rubber as the team's walkover, an unplayed dead rubber as an incomplete structure.
 *
 * A tieMatchUp is the matchUp with a `collectionId`, which the stored record carries, so this answers the same on
 * raw and in-context lists. A draw with no TEAM matchUps has no tieMatchUps: every matchUp is returned.
 *
 * Typed by the LIST so an untyped list stays untyped: a parameter typed by its element infers the bare constraint
 * from `any`, and every caller passing an untyped list would read its matchUps as `MatchUp` from here on.
 */
export function teamLevelMatchUps<L extends MatchUp[]>(matchUps: L | undefined): L[number][] {
  return matchUps?.filter((matchUp): matchUp is L[number] => !matchUp.collectionId) ?? [];
}
