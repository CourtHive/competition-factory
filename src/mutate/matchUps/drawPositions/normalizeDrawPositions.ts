/**
 * The single place a `matchUp.drawPositions` array is settled before it is stored.
 *
 * A HOLE IS LOAD-BEARING ONLY BESIDE A SURVIVOR. `drawPositions` is positional — the three reader
 * idioms that derive a side from its order are catalogued in `getOrderedDrawPositions` — so
 * `[undefined, 5]` must keep its hole: compacting it to `[5]` moves 5 from side 2 to side 1 and
 * every one of those readers then resolves the wrong participant. That hole is deliberate.
 *
 * An array of nothing BUT holes is a different thing. It holds no side open, because there is no
 * survivor for it to hold the side open beside, and it carries no information at all. It is also
 * not a shape the engine writes anywhere else: generation already emits `[]` for a matchUp nobody
 * has reached yet (`buildRound` filters, `buildFeedRound` writes `[]`), and `pruneDrawDefinition`
 * deletes the key outright. Only the removal/substitution writers produced it.
 *
 * `[]` is therefore the settled form, and it means what it says: this matchUp holds no drawPosition.
 *
 * ## The consumer-visible consequence, stated here because it is not obvious at the call sites
 *
 * `addMatchUpContext` hydrates through `definedAttributes(obj, undefined, true)`, whose third
 * argument DROPS empty arrays — so a stored `[]` becomes an ABSENT `drawPositions` key on the
 * inContext matchUp every consumer renders from. That is already the shape of every unplayed
 * downstream matchUp in every draw, so it is the existing contract rather than a new one; see
 * `src/tests/query/matchUps/drawPositionsHydrationContract.test.ts`, which pins both halves.
 *
 * Every writer that can REMOVE or SUBSTITUTE a position must route through here.
 * `src/tests/refactoring/drawPositionsNormalizationBypass.test.ts` fails on any that does not.
 *
 * The full set of rules governing this array — uniqueness within a structure, the positional
 * binding and the three reader idioms that depend on it, fed vs advanced, and why an absent key is
 * the ordinary shape of an unplayed matchUp — is published for consumers and contributors at
 * `documentation/docs/concepts/draw-positions.md`. Keep the two in step.
 */
export function normalizeDrawPositions(drawPositions: (number | undefined)[]): number[] {
  return (drawPositions.some(Boolean) ? drawPositions : []) as number[];
}
