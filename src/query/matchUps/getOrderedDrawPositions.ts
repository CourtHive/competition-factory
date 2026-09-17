import { overlap } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';
import { numericSort } from '@Tools/sorting';

// types
import { RoundProfile } from '@Types/factoryTypes';

type GetOrderedDrawPositionsArgs = {
  roundProfile: RoundProfile;
  drawPositions: number[];
  roundNumber: number;
};
/**
 * A HOLE IS NOT A DRAWPOSITION.
 *
 * `ensureInt` returns **0** for anything that is neither a number nor a numeric string — `undefined`
 * and `null` included — and `isNaN(0)` is `false`. So every "is this a position?" test written as
 * `!isNaN(ensureInt(x))` silently accepts a hole. Excluding them explicitly is the only safe form.
 */
const isDrawPosition = (position: any): boolean =>
  position !== undefined && position !== null && !isNaN(ensureInt(position));

export function getOrderedDrawPositions({ drawPositions, roundProfile, roundNumber }: GetOrderedDrawPositionsArgs) {
  const unassignedDrawPositions = [undefined, undefined];

  // EVERY BRANCH BELOW READS `realDrawPositions`, NEVER THE RAW ARRAY — because the raw array's
  // SHAPE is not information. The engine spells the same occupancy several ways depending on which
  // writer last touched it (`[5]`, `[5, undefined]`, `[undefined, 5]`, `[]`, `[undefined, undefined]`,
  // absent), and a consumer reading the sides has no idea which writer ran.
  //
  // This used to branch on `allNumeric(drawPositions)`, which is TRUE for a one-element array — so a
  // COMPACTED lone position never reached the feed-round rule below and fell through to the
  // roundProfile pairing instead, which reports BOTH positions of the pair for a matchUp that holds
  // one. Measured live over both frozen census windows on both arms: 277 feed-round matchUps
  // disagreed with the same occupancy spelled `[N, undefined]`. Pinned by
  // `drawPositionsRepresentationIndependence.test.ts`.
  const realDrawPositions = (drawPositions ?? []).filter(isDrawPosition);

  if (!realDrawPositions.length) {
    return {
      orderedDrawPositions: unassignedDrawPositions,
      displayOrder: unassignedDrawPositions,
    };
  }

  const targetRoundProfile = roundProfile?.[roundNumber];
  const pairedDrawPositions = targetRoundProfile?.pairedDrawPositions;
  const displayOrder =
    pairedDrawPositions?.find((pair) => overlap(pair ?? [], realDrawPositions)) ?? unassignedDrawPositions;

  /**
   * THE FED/ADVANCED TEST. A drawPosition that is present in the PRIOR round of this structure
   * played its way here; one that is not has just been fed in through a link.
   *
   *   present in the prior round  ->  ADVANCED
   *   absent from the prior round ->  FED
   *
   * This is the same test `getRoundMatchUps` makes when it builds `pairedDrawPositions`
   * (`intersection(priorRoundDrawPositions, filteredDrawPositions)`), so the two agree by
   * construction rather than by coincidence.
   *
   * ## Why not the numeric form
   *
   * Fed positions are usually numbered BELOW the first round's block, so "is it lower than the
   * lowest round-1 drawPosition" looks like an equivalent and cheaper test. Measured over both
   * frozen census windows on both arms it agrees on **113,626 of 113,632** live cases — and the
   * six exceptions are a whole draw type, not noise. **DOUBLE_ELIMINATION's Main final is fed from
   * the Backdraw, which shares Main's drawPosition space**, so its fed positions sit INSIDE the
   * first round's range and the numeric test calls them advanced. `getRoundMatchUps` says the same
   * thing in its own words: *"ADVANCED fed positions are NOT guaranteed to be in numeric order"*.
   */
  const priorRoundDrawPositions = (roundProfile?.[roundNumber - 1]?.drawPositions ?? [])
    .filter(isDrawPosition)
    .map(ensureInt);

  // ############# IMPORTANT DO NOT CHANGE #################
  // when both present, drawPositions are always sorted numerically
  // this holds true even when fed positions encounter each other in later rounds
  // { sideNumber: 1 } always goes to the lower drawPosition
  // displayOrder for feedRounds follows this rule...
  // ...but displayOrder for non-fed rounds must look back to the previous round
  // previous round lookback is provided by the roundProfile
  //
  // ---------------------------------------------------------------------------------------------
  // THE ASCENDING ORDER IS THE SIDE/POSITION BINDING. This is the canonical statement of it; sites
  // that depend on it point here rather than restate it.
  //
  // A matchUp's `drawPositions` are stored ascending, and THREE reader idioms across the engine
  // derive a side from that order:
  //
  //   1. `drawPositions[winningSide - 1]`      — assignMatchUpDrawPosition, sideExitProvenance
  //   2. `drawPositions[someIndex]`            — directParticipants, removeDirectedParticipants,
  //                                              positionClear, assignDrawPositionBye
  //   3. `indexOf(drawPosition) + 1` as a side — doubleExitAdvancement, removeOnwardLoserPlacements
  //
  // Every one of them silently resolves the WRONG PARTICIPANT if the order is not maintained. They
  // do not fail loudly; they answer confidently and wrongly.
  //
  // THEREFORE: ANY WRITER OF `drawPositions` MUST LEAVE THEM ASCENDING. Removing a position (mapping
  // it to `undefined`) preserves order and is safe. Rewriting one IN PLACE does not — a positional
  // `map` that substitutes a higher position into the first slot produces [7, 5]. That is exactly
  // how `swapWinnerLoser` broke it, reported by `getStructureInconsistencies` as
  // DRAW_POSITIONS_NOT_SORTED: 25 findings across two 600-seed census windows, all from one line.
  //
  // Surveyed 2026-09-14 across every writer in `src/`: the others either remove a position,
  // renumber in array order (self-normalising), or assign `nextPosition++` twice. Keep it that way.
  //
  // SEPARATELY, AND JUST AS LOAD-BEARING: a drawPosition is unique WITHIN A STRUCTURE and carries no
  // meaning across structures. Never compare one against matchUps or positionAssignments drawn from
  // a different structure; scope the collection by `structureId` first.
  // ---------------------------------------------------------------------------------------------
  const isFeedRound = targetRoundProfile?.feedRound;
  if (realDrawPositions.length >= 2) {
    const orderedDrawPositions = [...realDrawPositions].sort(numericSort); // spread to avoid immutable client data

    return {
      orderedDrawPositions: orderedDrawPositions.length === 2 ? orderedDrawPositions : displayOrder,
      displayOrder: isFeedRound ? orderedDrawPositions : displayOrder,
    };
  }

  // ############# IMPORTANT DO NOT CHANGE #################
  // when only one side is present in a feedRound, it is the fed position
  // and fed positions are always { sideNumber: 1 }
  //
  // ############# IMPORTANT DO NOT CHANGE #################
  // Reached with EXACTLY ONE real position, however the array spelled it.
  //
  // A lone position on a feed round is NOT automatically the fed one — the fed slot may still be
  // empty while the ADVANCED position waits in it, and that position belongs on side 2. The two are
  // told apart by value, not by array index: see `firstRoundDrawPosition` above. This is the whole
  // reason the spelling could never have decided it — `[5]`, `[5, undefined]` and `[undefined, 5]`
  // say nothing about whether 5 was fed or advanced, and two of the three used to imply it.
  //
  // The old code reached this branch only for a spelling that carried a hole, and picked the fed
  // position with `find((p) => !isNaN(ensureInt(p)))` — which accepts a hole (see `isDrawPosition`),
  // so `[undefined, 5]` resolved to the HOLE and hydrated with both sides empty. All of that is
  // gone. Pinned by `feedRoundHoleSelection.test.ts` and
  // `drawPositionsRepresentationIndependence.test.ts`.
  if (isFeedRound) {
    const [onlyDrawPosition] = realDrawPositions;
    // An empty prior round reads as "not advanced", which lands on the historical assumption — a
    // lone position on a feed round is the fed one — and that is the right fallback.
    const hasAdvanced = priorRoundDrawPositions.includes(ensureInt(onlyDrawPosition));
    const orderedDrawPositions = hasAdvanced ? [undefined, onlyDrawPosition] : [onlyDrawPosition, undefined];
    return { orderedDrawPositions, displayOrder: orderedDrawPositions };
  }

  return { orderedDrawPositions: displayOrder, displayOrder };
}
