import type { MatchUp } from '@Types/tournamentTypes';

declare const teamLevelBrand: unique symbol;

/**
 * A matchUp read through `teamLevelMatchUps`, so never a tieMatchUp. Only the accessor produces it: a function whose
 * logic counts or ranges a draw's matchUps asks for `TeamLevel<…>[]`, and a list straight from a tie-inclusive getter
 * does not compile there. A phantom brand, nothing at runtime. Casting to it is banned by lint outside this file.
 */
export type TeamLevel<M> = M & { readonly [teamLevelBrand]: true };

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
 * from `any`, and every caller passing an untyped list would read its matchUps as `MatchUp` from here on. The same
 * holds for the brand: `TeamLevel<any>` is `any`, so an untyped list is not checked, which is why the functions that
 * require the brand still filter for themselves.
 */
export function teamLevelMatchUps<L extends MatchUp[]>(matchUps: L | undefined): TeamLevel<L[number]>[] {
  // eslint-disable-next-line no-restricted-syntax -- the one place the brand is minted
  return (matchUps?.filter((matchUp) => !matchUp.collectionId) ?? []) as TeamLevel<L[number]>[];
}
