import { getPositionAssignments } from '../drawDefinition/positionsGetter';
import { chunkArray, generateRange } from '@Tools/arrays';
import { getDevContext } from '@Global/state/globalState';
import { reduceGroupedOrder } from './reduceGroupedOrder';
import { findExtension } from '@Acquire/findExtension';
import { findStructure } from '@Acquire/findStructure';

// constants
import { MISSING_TARGET_LINK, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import { DRAW, BOTTOM_UP, RANDOM, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { DISABLE_LINKS } from '@Constants/extensionConstants';

export function getTargetMatchUp({
  sourceRoundMatchUpCount,
  inContextDrawMatchUps,
  sourceRoundPosition,
  drawDefinition,
  targetLink,
}) {
  if (!targetLink) return { error: MISSING_TARGET_LINK };

  const {
    target: { structureId, feedProfile, groupedOrder, roundNumber, positionInterleave },
  } = targetLink;

  const { structure: targetStructure } = findStructure({
    drawDefinition,
    structureId,
  });

  const { positionAssignments } = getPositionAssignments({
    structure: targetStructure,
  });

  const structureMatchUps = inContextDrawMatchUps?.filter(
    (matchUp) => matchUp.structureId === targetStructure?.structureId,
  );
  const targetRoundMatchUps = structureMatchUps.filter(
    (matchUp) => matchUp.roundNumber === roundNumber && !matchUp.matchUpTieId, // exclude tieMatchUps
  );
  const targetRoundMatchUpCount = targetRoundMatchUps.length;
  const roundPositions = generateRange(1, targetRoundMatchUpCount + 1);

  const matchUpCountFactor = targetRoundMatchUpCount / sourceRoundMatchUpCount;

  // usually target structures are half the size of source structures
  // which means the calculatedRoundPosition for target matchUps is sourceRoundPosition * 0.5
  let calculatedRoundPosition = Math.ceil(matchUpCountFactor * sourceRoundPosition);
  let matchUpDrawPositionIndex = 1 - (sourceRoundPosition % 2);

  // when more than one source structure or more than one source structure round feed the same round in the target structure
  // then there is a positionInterleave attribute which specifies both an offset and an interleave
  // the offset is the number of positions from the start
  // the interleave indicates how many positions are fed in between each position fed by current source structure round
  if (positionInterleave?.interleave && matchUpCountFactor !== 0.5) {
    // the oofset here is a combination of the specified offset and the number of previous positions interleaved
    const offset = positionInterleave.offset + (sourceRoundPosition - 1) * positionInterleave.interleave;
    // the target drawPosition is relative because the actual drawPosition value is based on the number of subseqent round feed-in matchUps
    const relativeRoundPosition = sourceRoundPosition + offset;
    calculatedRoundPosition = Math.ceil(relativeRoundPosition / 2);
    // the index in the target matchUp.drawPositions[] is recalculated based on calculated relative drawPosition
    matchUpDrawPositionIndex = 1 - (relativeRoundPosition % 2);
  }

  let orderedPositions = roundPositions;
  let targetedRoundPosition = roundPositions[calculatedRoundPosition - 1];

  const sizedGroupOrder = reduceGroupedOrder({
    roundPositionsCount: roundPositions.length,
    groupedOrder,
  });
  const groupsCount = sizedGroupOrder?.length || 1;
  if (groupsCount <= roundPositions.length) {
    const groupSize = targetRoundMatchUpCount / groupsCount;
    const groups = chunkArray(roundPositions, groupSize);
    if (feedProfile === BOTTOM_UP) groups.forEach((group) => group.reverse());
    orderedPositions =
      (sizedGroupOrder?.length && sizedGroupOrder?.map((order) => groups[order - 1]).flat()) || orderedPositions;
  }

  if (feedProfile === TOP_DOWN) {
    /*
      TOP_DOWN feed profile implies that the roundPosition in the
      target is equivalent to the roundPosition in the source
    */
    targetedRoundPosition = orderedPositions[calculatedRoundPosition - 1];
  } else if (feedProfile === BOTTOM_UP) {
    /*
      BOTTOM_UP feed profile implies that the roundPosition in the
      target is (# of matchUps in source/target round + 1) - roundPosition in the source
    */
    if (!sizedGroupOrder?.length || groupsCount > roundPositions.length) {
      calculatedRoundPosition = targetRoundMatchUps.length + 1 - calculatedRoundPosition;
    }
    targetedRoundPosition = orderedPositions[calculatedRoundPosition - 1];
  } else if (feedProfile === RANDOM) {
    /*
      RANDOM feed profile selects a random position from available
    */
    if (getDevContext()) console.log(NOT_IMPLEMENTED, { feedProfile });
  } else if (feedProfile === DRAW) {
    /*
      calculatedRoundPosition is undetermined for DRAW feedProfile
    */
  }

  const matchUp =
    targetedRoundPosition &&
    targetRoundMatchUps.reduce((matchUp, current) => {
      return current.roundPosition === targetedRoundPosition ? current : matchUp;
    }, undefined);

  // targetDrawPosition and matchUpDrawPositionIndex are only relevant
  // when drawPositions need to be assigned in positionAssignments
  // which means only when a targetMatchUp is in a different structure
  let targetDrawPosition;
  if (matchUp?.feedRound) {
    // for fedDrawPositions in linked elimination structures...
    // ...when roundNumber > 1 matchUpDrawPositionIndex should always be 0
    // ...because fed drawPositions are always numerically smaller than advanced drawPositions
    matchUpDrawPositionIndex = 0;
    targetDrawPosition = Math.min(...(matchUp.drawPositions ?? []).filter(Boolean));
  } else {
    // when not a feedRound targetDrawPosition can only be determined when both drawPositions present
    targetDrawPosition = matchUp?.drawPositions?.length === 2 && matchUp?.drawPositions[matchUpDrawPositionIndex];
  }

  const relevantAssignment = positionAssignments?.find(({ drawPosition }) => drawPosition === targetDrawPosition);
  if (relevantAssignment) {
    const { extension } = findExtension({
      element: relevantAssignment,
      name: DISABLE_LINKS,
    });
    if (extension?.value) {
      return { disabledDrawPosition: targetDrawPosition };
    }
  }

  return {
    matchUp,
    targetDrawPosition,
    matchUpDrawPositionIndex,
  };
}
