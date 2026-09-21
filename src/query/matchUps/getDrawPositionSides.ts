import { getOrderedDrawPositions } from '@Query/matchUps/getOrderedDrawPositions';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';

// types
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

export type DrawPositionSide = { drawPosition: number; sideNumber: number };

/**
 * Which side each of a matchUp's drawPositions is on.
 *
 * `drawPositions` alone cannot answer this while only ONE position is present. The array is
 * COMPACTED — a matchUp awaiting its second participant is stored `[4]`, not `[undefined, 4]` — so
 * `drawPositions[sideNumber - 1]` indexes past the end, and the reverse reading seats the arrival on
 * side 1 when it belongs on side 2. `documentation/docs/concepts/draw-positions.md` § 5 and § 6
 * carry the spellings and why the hole beside a survivor is load-bearing.
 *
 * A subscriber holding a HYDRATED matchUp should read `sides` instead: `sideNumber` and
 * `drawPosition` are already bound there. This exists for the notice payload, which carries the
 * stored matchUp and therefore no `sides` at all.
 *
 * With BOTH positions present the answer is already public and exact — side 1 is the numerically
 * lower drawPosition — so nothing is computed and nothing is emitted.
 *
 * Returns `undefined` when the question does not arise (no positions, both present) or cannot be
 * answered here (the structure or its rounds could not be resolved) — never a guess.
 */
export function getDrawPositionSides({
  drawDefinition,
  structureId,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  structureId?: string;
  matchUp?: MatchUp;
}): DrawPositionSide[] | undefined {
  const present = (matchUp?.drawPositions ?? []).filter(Boolean);
  if (present.length !== 1) return undefined;

  const roundNumber = matchUp?.roundNumber;
  if (!roundNumber || !structureId || !drawDefinition?.structures?.length) return undefined;

  const structure = findStructure(drawDefinition.structures, structureId);
  if (!structure?.matchUps?.length) return undefined;

  const { roundProfile } = getRoundMatchUps({ matchUps: structure.matchUps });
  if (!roundProfile) return undefined;

  const { orderedDrawPositions } = getOrderedDrawPositions({
    drawPositions: matchUp?.drawPositions ?? [],
    roundProfile,
    roundNumber,
  });

  // `orderedDrawPositions` is positional with holes preserved, which is the whole point: the index
  // of the real position IS its side.
  const sides = (orderedDrawPositions ?? []).reduce((acc: DrawPositionSide[], drawPosition, index) => {
    if (drawPosition) acc.push({ drawPosition, sideNumber: index + 1 });
    return acc;
  }, []);

  return sides.length ? sides : undefined;
}

/** Depth first: a round robin's matchUps belong to the GROUP, not its parent. */
function findStructure(structures: any[], structureId: string): any {
  for (const structure of structures ?? []) {
    if (structure?.structures?.length) {
      const nested = findStructure(structure.structures, structureId);
      if (nested) return nested;
    }
    if (structure?.structureId === structureId) return structure;
  }
  return undefined;
}
