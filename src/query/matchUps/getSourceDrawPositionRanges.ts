import { requireParams } from '@Helpers/parameters/requireParams';
import { getMappedStructureMatchUps } from './getMatchUpsMap';
import { chunkArray, generateRange } from '@Tools/arrays';
import { reduceGroupedOrder } from './reduceGroupedOrder';
import { findStructure } from '@Acquire/findStructure';
import { getRoundMatchUps } from './getRoundMatchUps';
import { getRangeString } from './getRangeString';

// constants
import { DRAW_DEFINITION, STRUCTURE_ID } from '@Constants/attributeConstants';
import { BOTTOM_UP, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { INVALID_STAGE } from '@Constants/errorConditionConstants';

export function getSourceDrawPositionRanges({ drawDefinition, structureId, matchUpsMap }): any {
  const paramsCheck = requireParams({ drawDefinition, structureId }, [DRAW_DEFINITION, STRUCTURE_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { structure } = findStructure({ drawDefinition, structureId });
  if (structure?.stage !== CONSOLATION) return { error: INVALID_STAGE, info: 'Structure is not CONSOLATION stage' };

  const { links } = drawDefinition;
  const relevantLinks = links?.filter((link) => link.target.structureId === structureId) ?? [];

  const sourceStructureIds =
    relevantLinks?.reduce((sourceStructureIds, link) => {
      const { structureId: sourceStructureId } = link.source;
      return sourceStructureIds.includes(sourceStructureId)
        ? sourceStructureIds
        : sourceStructureIds.concat(sourceStructureId);
    }, []) ?? [];

  const sourceStructureProfiles = Object.assign(
    {},
    ...sourceStructureIds.map((sourceStructureId) => {
      const structureMatchUps = getMappedStructureMatchUps({
        structureId: sourceStructureId,
        matchUpsMap,
      });
      const roundMatchUpsResult = getRoundMatchUps({
        matchUps: structureMatchUps,
      });

      const roundProfile = roundMatchUpsResult.roundProfile;
      return { [sourceStructureId]: roundProfile };
    }),
  );

  const structureMatchUps = getMappedStructureMatchUps({
    matchUpsMap,
    structureId,
  });
  const { roundProfile: targetStructureProfile } = getRoundMatchUps({
    matchUps: structureMatchUps,
  });

  const sourceDrawPositionRanges = {};
  relevantLinks?.forEach((link) => {
    const { structureId: sourceStructureId, roundNumber: sourceRoundNumber } = link.source;
    const { feedProfile, groupedOrder, positionInterleave, roundNumber: targetRoundNumber } = link.target;
    const sourceStructureProfile = sourceStructureProfiles[sourceStructureId];
    const firstRoundDrawPositions = sourceStructureProfile[1]?.drawPositions;
    const sourceRoundProfile = sourceStructureProfile[sourceRoundNumber];
    const sourceRoundMatchUpsCount = sourceRoundProfile?.matchUpsCount;
    if (!sourceRoundMatchUpsCount) return;

    const chunkSize = sourceRoundMatchUpsCount ? firstRoundDrawPositions.length / sourceRoundMatchUpsCount : 0;
    const targetRoundMatchUpsCount = firstRoundDrawPositions.length / chunkSize;
    let orderedPositions = firstRoundDrawPositions.slice();

    const sizedGroupOrder = reduceGroupedOrder({
      roundPositionsCount: targetRoundMatchUpsCount,
      groupedOrder,
    });

    const groupsCount = sizedGroupOrder?.length || 1;
    if (groupsCount <= targetRoundMatchUpsCount) {
      const groupSize = firstRoundDrawPositions.length / groupsCount;
      const groups = chunkArray(orderedPositions, groupSize);
      if (feedProfile === BOTTOM_UP) groups.forEach((group) => group.reverse());
      orderedPositions =
        (sizedGroupOrder?.length && sizedGroupOrder?.map((order) => groups[order - 1]).flat()) || groups.flat();
    }

    let drawPositionBlocks = chunkArray(orderedPositions, chunkSize);

    // positionInterleave describes how positions are fed from source to target
    // In double elimination, for instance:
    //  - roundNumber: 1 has positions fed top down from source roundNumber: 1
    //  - roundNumber: 1 has positions fed bottom up from source roundNumber: 2
    // These TOP_DOWN and BOTTOM_UP feeds are interleaved, e.g. T1, B3, T2, B2, T3, B1
    // The BOTTOM_UP feed in this example is offset (shifted down) by 1 and reversed
    if (positionInterleave) {
      // an array of undefined items
      const interleave = generateRange(0, positionInterleave.interleave).map(() => undefined);
      // an array of undefined items. NOTE: new Array(#) does not work in this instance
      const offset = generateRange(0, positionInterleave.offset).map(() => undefined);
      drawPositionBlocks = drawPositionBlocks.map((block) => [block, ...interleave]);
      drawPositionBlocks.unshift(offset);
      drawPositionBlocks = drawPositionBlocks.flat(1);
      const targetLength = drawPositionBlocks.length - positionInterleave.offset;
      drawPositionBlocks = drawPositionBlocks.slice(0, targetLength);
    }

    // build an object with keys [targetRoundnumber][roundPosition]
    if (!sourceDrawPositionRanges[targetRoundNumber]) sourceDrawPositionRanges[targetRoundNumber] = {};

    // drawPositions for consolation structures are offset by the number of fed positions in subsequent rounds
    // columnPosition gives an ordered position value relative to a single column
    // when the number of drawPositions is greater than the number of drawPositionBlocks for a given roundNumber
    // then sourceDrawPositionRanges are being added to a feedRound
    // targetStructureProfile also has the boolean attribute .feedRound to flag this case
    const targetRoundProfile = targetStructureProfile?.[targetRoundNumber];
    const increment = targetRoundProfile?.feedRound ? 2 : 1;

    drawPositionBlocks.forEach((block, index) => {
      // fed drawPositions are always sideNumber: 1, so when the increment is 2 the columnPosition is always an odd number
      // because sideNumber: 1 maps to index: 0 in matchUp.drawPositions
      const columnPosition = 1 + index * increment;
      if (!sourceDrawPositionRanges[targetRoundNumber][columnPosition]) {
        sourceDrawPositionRanges[targetRoundNumber][columnPosition] = getRangeString(block);
      }
    });
  });

  return { sourceDrawPositionRanges };
}

/*
 * function getRangeString(arr) {
 *   if (!Array.isArray(arr)) return '';
 *   const numericArray = arr.filter(isNumeric);
 *   if (!numericArray.length) return '';
 *   const range = unique([Math.min(...numericArray), Math.max(...numericArray)]);
 *   return range.join('-');
 * }
 */
