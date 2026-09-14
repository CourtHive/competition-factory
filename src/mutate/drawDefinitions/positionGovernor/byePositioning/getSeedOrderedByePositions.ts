import { getStructurePositionedSeeds } from '@Query/structure/getStructurePositionedSeeds';
import { getBlockSortedRandomDrawPositions } from './getBlockSortedRandomDrawPositions';
import { getNumericSeedValue } from '@Query/drawDefinition/getNumericSeedValue';
import { getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { unique } from '@Tools/arrays';

export function getSeedOrderByePositions({
  provisionalPositioning,
  relevantMatchUps,
  appliedPolicies,
  drawDefinition,
  seedingProfile,
  seedBlockInfo,
  byesToPlace,
  structure,
}) {
  if (!seedBlockInfo) {
    seedBlockInfo = getValidSeedBlocks({
      provisionalPositioning,
      appliedPolicies,
      drawDefinition,
      seedingProfile,
      structure,
    });
  }

  const { isFeedIn, isLuckyStructure, isContainer } = seedBlockInfo;
  let { validSeedBlocks } = seedBlockInfo;
  if (appliedPolicies?.seeding?.containerByesIgnoreSeeding) validSeedBlocks = [];

  const positionedSeeds =
    getStructurePositionedSeeds({
      provisionalPositioning,
      drawDefinition,
      structure,
    }) ?? [];

  const relevantDrawPositions = unique([].concat(...relevantMatchUps.map((matchUp) => matchUp.drawPositions)));
  const relevantPositionedSeeds = positionedSeeds.filter((positionedSeed) => {
    return relevantDrawPositions.includes(positionedSeed.drawPosition);
  });

  // within seedBlocks positionedSeeds are sorted by seedValue to handle the situation
  // where there are multiple players seeded with the same seedValue which have been
  // randomly assigned to different seedBlocks
  // Example: more than one 4th seed, but only one of them placed in the 3-4 seed block
  // 3rd seed must get 3rd Bye, and 4th seed placed in the 3-4 seed block must get 4th bye
  const seedValueSort = (a, b) => getNumericSeedValue(a.seedValue) - getNumericSeedValue(b.seedValue);
  const valueOrderedBlockSortedPositionedSeeds = validSeedBlocks.reduce((result, seedBlock) => {
    const positionedSeedsInBlock = relevantPositionedSeeds
      .filter((positionedSeed) => seedBlock.drawPositions?.includes(positionedSeed.drawPosition))
      .sort(seedValueSort);
    return result.concat(...positionedSeedsInBlock);
  }, []);

  const orderedSortedFirstRoundSeededDrawPositions = valueOrderedBlockSortedPositionedSeeds.map(
    (positionedSeed) => positionedSeed.drawPosition,
  );

  const blockSortedRandomDrawPositions = getBlockSortedRandomDrawPositions({
    orderedSortedFirstRoundSeededDrawPositions,
    validSeedBlocks,
    byesToPlace,
  });

  // returns list of bye positions which strictly follows where seeds
  // have been placed according to sorted seedNumbers
  const strictSeedOrderByePositions = getOrderedByePositions({
    orderedSeedDrawPositions: orderedSortedFirstRoundSeededDrawPositions,
    relevantMatchUps,
  }).slice(0, byesToPlace);

  const blockSeedOrderByePositions = getOrderedByePositions({
    orderedSeedDrawPositions: blockSortedRandomDrawPositions,
    relevantMatchUps,
  }).slice(0, byesToPlace);

  return {
    strictSeedOrderByePositions,
    blockSeedOrderByePositions,
    isLuckyStructure,
    positionedSeeds,
    isContainer,
    isFeedIn,
  };
}

function getOrderedByePositions({ orderedSeedDrawPositions, relevantMatchUps }) {
  // if relevantMatchUps excludes FEED_IN rounds...
  // matchUpDrawPositions will equal firstRoundDrawPositions
  // In CONTAINER/ROUND_ROBIN structures drawPositions are duplicated
  // and therefore must placed in drawOrder within Groups

  const matchUpDrawPositionPairs = relevantMatchUps.map((matchUp) => matchUp.drawPositions);
  const consideredDrawPositionPairs = matchUpDrawPositionPairs
    .map((pair) => pair?.sort((a, b) => a - b))
    .filter((pair) => pair?.[0] + 1 === pair?.[1]);

  // sort seededMatchUps so that pairedPositions represent seed order
  const seedOrderSortedDrawPositionPairs = orderedSeedDrawPositions
    .map((drawPosition) => consideredDrawPositionPairs.find((drawPositions) => drawPositions?.includes(drawPosition)))
    .filter(Boolean);

  return seedOrderSortedDrawPositionPairs
    .map((drawPositions) => {
      return drawPositions?.reduce((byePosition, drawPosition) => {
        const included = orderedSeedDrawPositions.includes(drawPosition);
        return included ? byePosition : drawPosition;
      }, undefined);
    })
    .filter(Boolean);
}
