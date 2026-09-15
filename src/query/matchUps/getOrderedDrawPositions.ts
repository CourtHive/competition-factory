import { allNumeric, noNumeric, overlap } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';
import { numericSort } from '@Tools/sorting';

// types
import { RoundProfile } from '@Types/factoryTypes';

type GetOrderedDrawPositionsArgs = {
  roundProfile: RoundProfile;
  drawPositions: number[];
  roundNumber: number;
};
export function getOrderedDrawPositions({ drawPositions, roundProfile, roundNumber }: GetOrderedDrawPositionsArgs) {
  const unassignedDrawPositions = [undefined, undefined];

  if (noNumeric(drawPositions)) {
    return {
      orderedDrawPositions: unassignedDrawPositions,
      displayOrder: unassignedDrawPositions,
    };
  }

  const targetRoundProfile = roundProfile?.[roundNumber];
  const pairedDrawPositions = targetRoundProfile?.pairedDrawPositions;
  const displayOrder =
    pairedDrawPositions?.find((pair) => overlap(pair ?? [], drawPositions.filter(Boolean))) ?? unassignedDrawPositions;

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
  if (allNumeric(drawPositions)) {
    const orderedDrawPositions = [...drawPositions].sort(numericSort); // spread to avoid immutable client data

    return {
      orderedDrawPositions: orderedDrawPositions.length === 2 ? orderedDrawPositions : displayOrder,
      displayOrder: isFeedRound ? orderedDrawPositions : displayOrder,
    };
  }

  // ############# IMPORTANT DO NOT CHANGE #################
  // when only one side is present in a feedRound, it is the fed position
  // and fed positions are always { sideNumber: 1 }
  if (isFeedRound) {
    const drawPosition = drawPositions.find((drawPosition) => !isNaN(ensureInt(drawPosition)));
    const orderedDrawPositions = [drawPosition, undefined];
    return { orderedDrawPositions, displayOrder: orderedDrawPositions };
  }

  return { orderedDrawPositions: displayOrder, displayOrder };
}
