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

/**
 * The drawPosition held by a matchUp's WINNING side, or `undefined` when there is not one to name.
 *
 * `drawPositions[winningSide - 1]` is the idiom this replaces, and it is only sound while BOTH
 * positions are present — which is when the ascending order binds side to position. Measured over
 * the full suite 2026-09-28: the unguarded form in `withdrawFromMatchUp` was reached once with a
 * COMPACTED single-position array, where index 0 is whichever position is present and not
 * necessarily side 1's. Reading it there either releases a position belonging to the other side or
 * silently releases nothing, and neither announces itself.
 *
 * So: with both present, index by order and point at the canonical statement. With one present, ask
 * `getDrawPositionSides`, which resolves the side structurally through the round profile. A lone
 * position on the LOSING side yields `undefined` — correctly, because the winning side is empty and
 * has nobody advanced to take back.
 */
export function getWinningSideDrawPosition({
  drawDefinition,
  structureId,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  structureId?: string;
  matchUp?: MatchUp;
}): number | undefined {
  const winningSide = matchUp?.winningSide;
  if (!winningSide) return undefined;

  const drawPositions = matchUp?.drawPositions ?? [];
  // Derives a side from drawPosition ORDER — valid only because drawPositions are stored ascending,
  // and only while both are present. See the canonical statement in `getOrderedDrawPositions`.
  if (drawPositions.filter(Boolean).length === 2) return drawPositions[winningSide - 1];

  return getDrawPositionSides({ drawDefinition, structureId, matchUp })?.find((side) => side.sideNumber === winningSide)
    ?.drawPosition;
}

/**
 * The drawPosition a HYDRATED matchUp holds on `sideNumber`, or `undefined` when that side holds none.
 *
 * The directing pair, `removeDirectedParticipants` and `processDrawPositionDirecting`, read
 * `drawPositions[winningSide - 1]` and `drawPositions[1 - (winningSide - 1)]`. While only one position
 * is present the array is compacted, so index 0 is whichever position is there. An exit awarded to a
 * VACANT side 1 against an occupant on side 2 then named that occupant the winner's position and the
 * loser's position `undefined`, and the loser was never fed on. Census seed 9000522 (COMPASS 16/11),
 * one step: `East|2|3` WALKOVER to side 1, the occupant on side 2 arrived through a BYE, and the
 * draw reported DROPPED_PROGRESSION.
 *
 * With both present the ascending order binds side to position (see `getOrderedDrawPositions`). With
 * one present, `sides` already carries the binding; failing that, `getDrawPositionSides` resolves it
 * through the round profile. Never by index.
 */
export function getSideDrawPosition({
  drawDefinition,
  structureId,
  sideNumber,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  structureId?: string;
  sideNumber?: number;
  matchUp?: any;
}): number | undefined {
  if (!sideNumber) return undefined;
  const drawPositions = matchUp?.drawPositions ?? [];
  if (drawPositions.filter(Boolean).length === 2) return drawPositions[sideNumber - 1];
  if (!drawPositions.some(Boolean)) return undefined;

  // `sides` binds only once hydration has placed the position on one of them
  const sides = matchUp?.sides?.filter((side: any) => side?.drawPosition);
  if (sides?.length) return sides.find((side: any) => side.sideNumber === sideNumber)?.drawPosition;

  return getDrawPositionSides({ drawDefinition, structureId, matchUp })?.find((side) => side.sideNumber === sideNumber)
    ?.drawPosition;
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
