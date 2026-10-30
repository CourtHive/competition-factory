import { findStructure } from '@Acquire/findStructure';

// types
import { DrawDefinition } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * The lookups `positionTargets` makes over `inContextDrawMatchUps`, built ONCE for an operation that asks for the
 * targets of many matchUps of the same draw (`addGoesTo`, `addUpcomingMatchUps`). Without it every call scans the
 * whole array several times: one `addGoesTo` over a 128 FEED_IN_CHAMPIONSHIP visited ~224,000 matchUps for 253.
 *
 * It answers exactly what the scans answer, in the same order: the FIRST matchUp with an id, and each structure's
 * and each round's matchUps in array order (tie matchUps left out of the rounds, as the scans leave them out).
 * It holds references and keys on `matchUpId`, `structureId`, `roundNumber` and `matchUpTieId`, which no caller
 * changes while it iterates. `findStructure` answers are kept per structureId as they are asked for: it sorts
 * every structure of the draw on each call, and was most of the cost (SE 64 + playoffs, 31 structures). It belongs to the operation that built it: built from the array it is passed with,
 * never cached, never reused by a later call.
 */
export type TargetIndex = {
  structures: Map<string | undefined, ReturnType<typeof findStructure>>;
  byMatchUpId: Map<string, HydratedMatchUp>;
  byStructureId: Map<string | undefined, HydratedMatchUp[]>;
  roundsByStructureId: Map<string | undefined, Map<number | undefined, HydratedMatchUp[]>>;
};

export function buildTargetIndex(inContextDrawMatchUps: HydratedMatchUp[] = []): TargetIndex {
  const byMatchUpId = new Map<string, HydratedMatchUp>();
  const byStructureId = new Map<string | undefined, HydratedMatchUp[]>();
  const roundsByStructureId = new Map<string | undefined, Map<number | undefined, HydratedMatchUp[]>>();

  for (const matchUp of inContextDrawMatchUps) {
    if (!byMatchUpId.has(matchUp.matchUpId)) byMatchUpId.set(matchUp.matchUpId, matchUp);
    const { structureId, roundNumber } = matchUp;
    if (!byStructureId.has(structureId)) byStructureId.set(structureId, []);
    byStructureId.get(structureId)?.push(matchUp);
    if (matchUp.matchUpTieId) continue;
    if (!roundsByStructureId.has(structureId)) roundsByStructureId.set(structureId, new Map());
    const rounds = roundsByStructureId.get(structureId);
    if (!rounds?.has(roundNumber)) rounds?.set(roundNumber, []);
    rounds?.get(roundNumber)?.push(matchUp);
  }

  return { structures: new Map(), byMatchUpId, byStructureId, roundsByStructureId };
}

/** `findStructure`, asked once per structureId of an operation that holds an index */
export function indexedStructure({
  drawDefinition,
  targetIndex,
  structureId,
}: {
  drawDefinition: DrawDefinition;
  targetIndex?: TargetIndex;
  structureId?: string;
}): ReturnType<typeof findStructure> {
  if (!targetIndex) return findStructure({ drawDefinition, structureId });
  if (!targetIndex.structures.has(structureId)) {
    targetIndex.structures.set(structureId, findStructure({ drawDefinition, structureId }));
  }
  return targetIndex.structures.get(structureId) as ReturnType<typeof findStructure>;
}

/** a structure's round as the scan `roundNumber === n && !matchUpTieId` finds it; NaN is no round */
export function indexedRound(
  targetIndex: TargetIndex,
  structureId: string | undefined,
  roundNumber?: number,
): HydratedMatchUp[] {
  if (Number.isNaN(roundNumber)) return [];
  return targetIndex.roundsByStructureId.get(structureId)?.get(roundNumber) ?? [];
}
