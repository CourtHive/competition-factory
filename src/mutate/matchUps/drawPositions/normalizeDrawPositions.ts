/**
 * The single place a `matchUp.drawPositions` array is settled before it is stored: the positions PRESENT, ascending.
 *
 * NO HOLE IS STORED (CA, 2026-10-05, Q2: `tournament.schema.json` admits no `null` in `drawPositions`). A lone
 * survivor is stored `[5]` whatever its side; its side is read STRUCTURALLY, through the round profile, by the helpers
 * in `getDrawPositionSides.ts` (`getSideDrawPosition`, `getDrawPositionSideNumber`, `getWinningSideDrawPosition`).
 * The leading hole that used to hold a side-2 survivor at index 1 (`[undefined, 5]`) is gone; every reader that
 * indexed the raw array was moved onto those helpers first (step 1, #5253) and
 * `src/tests/mutations/drawPositionsAreReadByStructure.test.ts` holds the rest to an exact allow-list
 * (`Mentat/planning/LEADING_HOLE_REMOVAL_DESIGN.md`, step 2).
 *
 * Two positions are stored ascending, and side 1 is the lower: the binding `getOrderedDrawPositions` states.
 *
 * `[]` means what it says: this matchUp holds no drawPosition. `addMatchUpContext` hydrates through
 * `definedAttributes(obj, undefined, true)`, which DROPS empty arrays, so a stored `[]` is an ABSENT `drawPositions`
 * key on the inContext matchUp, the existing shape of every unplayed downstream matchUp
 * (`src/tests/query/matchUps/drawPositionsHydrationContract.test.ts`).
 *
 * Every writer that can REMOVE or SUBSTITUTE a position routes through here;
 * `src/tests/refactoring/drawPositionsNormalizationBypass.test.ts` fails on any that does not. The rules for this array
 * are published at `documentation/docs/concepts/draw-positions.md`. Keep the two in step.
 */
export function normalizeDrawPositions(drawPositions: (number | undefined)[]): number[] {
  return drawPositions.filter((drawPosition): drawPosition is number => !!drawPosition).sort((a, b) => a - b);
}
