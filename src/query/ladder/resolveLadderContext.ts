/**
 * Resolution shared by the ladder queries and mutations that the engine exposes.
 *
 * A ladder function needs a `structure` — and sometimes a `matchUp` — but an ENGINE caller supplies
 * neither. `paramsMiddleware` resolves `drawId` into `drawDefinition` and stops there; nothing
 * downstream of it knows which structure a ladder keeps its standing in.
 *
 * So resolution lives here rather than in a governor wrapper. A wrapper would give every one of
 * these functions two call shapes — the internal one taking `structure` and the engine one taking
 * `drawId` — and the two would drift. `refreshLadderRatings` already resolves this way; these
 * helpers make it the rule instead of the exception.
 *
 * An EXPLICIT `structure` or `matchUp` always wins. Existing internal callers pass one and must not
 * pay a lookup, and a caller holding a structure the drawDefinition does not contain is doing so on
 * purpose.
 */
export function resolveLadderStructure(params: any): any {
  if (params?.structure) return params.structure;
  const structures = params?.drawDefinition?.structures ?? [];
  if (params?.structureId) return structures.find((s: any) => s.structureId === params.structureId);
  // A ladder is a single structure by construction; falling back to the first is not a guess.
  return structures[0];
}

/**
 * The matchUp a challenge or a reported result lives on, plus the structure holding it.
 *
 * Searches every structure rather than assuming the first, because the caller identified the
 * matchUp and not the structure — answering from the wrong one would be a silent mismatch.
 */
export function resolveLadderMatchUp(params: any): { matchUp?: any; structure?: any } {
  if (params?.matchUp) return { matchUp: params.matchUp, structure: resolveLadderStructure(params) };
  const matchUpId = params?.matchUpId;
  if (!matchUpId) return {};
  for (const structure of params?.drawDefinition?.structures ?? []) {
    const matchUp = structure.matchUps?.find((m: any) => m.matchUpId === matchUpId);
    if (matchUp) return { matchUp, structure };
  }
  return {};
}
