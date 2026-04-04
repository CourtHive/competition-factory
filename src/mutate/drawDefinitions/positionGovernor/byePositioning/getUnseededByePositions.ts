import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getSeedPattern, getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getSeedBlocks } from '@Query/drawDefinition/getSeedBlocks';
import { chunkArray, shuffleArray, unique } from '@Tools/arrays';
import { numericSort } from '@Tools/sorting';

// Constants
import { ADJACENT, CLUSTER, CONTAINER, QUALIFYING } from '@Constants/drawDefinitionConstants';

export function getUnseededByePositions({
  provisionalPositioning,
  seedOrderByePositions,
  isLuckyStructure,
  appliedPolicies,
  drawDefinition,
  seedLimit,
  structure,
  isFeedIn,
  random,
}) {
  const seedingProfile = appliedPolicies?.seeding?.seedingProfile;
  const isQualifying = structure.stage === QUALIFYING;

  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const filledDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.participantId)
    .map((assignment) => assignment.drawPosition);

  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps, roundMatchUps } = getAllStructureMatchUps({
    provisionalPositioning,
    matchUpFilters,
    structure,
  });
  const firstRoundMatchUps = roundMatchUps?.[1] ?? [];

  // firstRoundMatchUps don't work for CONTAINER / ROUND_ROBIN structures
  const relevantMatchUps = structure.structureType === CONTAINER ? matchUps : firstRoundMatchUps;
  const relevantDrawPositions = unique(relevantMatchUps.flatMap((matchUp) => matchUp.drawPositions));
  const drawPositionOffset = Math.min(...relevantDrawPositions) - 1;

  const filledRelevantDrawPositions = filledDrawPositions?.filter((drawPosition) =>
    relevantDrawPositions.includes(drawPosition),
  );

  const getHalves = (chunk) => {
    const halfLength = Math.ceil(chunk.length / 2);
    const halves = [chunk.slice(0, halfLength), chunk.slice(halfLength)];
    const halfLengths = halves.map((half) => half.flat(Infinity).flat().length);
    const shortLength = Math.min(...halfLengths.flat(Infinity));
    const longLength = Math.max(...halfLengths.flat(Infinity));
    const longIndex = halfLengths.indexOf(longLength);
    const unequalHalves = shortLength !== longLength;
    const shuffledHalves = shuffleArray(halves, random);
    const [greaterHalf, lesserHalf] =
      !shortLength || unequalHalves
        ? [halves[longIndex], halves[1 - longIndex]]
        : [shuffledHalves[0], shuffledHalves[1]];
    return { greaterHalf, lesserHalf };
  };
  const getNextDrawPosition = (chunks) => {
    const { greaterHalf, lesserHalf } = getHalves(chunks);
    const { greaterHalf: greaterQuarter, lesserHalf: lesserQuarter } = getHalves(greaterHalf);
    const shuffledQuarter = shuffleArray(greaterQuarter.flat(Infinity), random);
    const drawPosition = shuffledQuarter.pop();
    const diminishedQuarter = greaterQuarter.flat().filter((position) => position !== drawPosition);
    const newlyFilteredChunks = [...lesserHalf, ...lesserQuarter, diminishedQuarter];
    return { newlyFilteredChunks, drawPosition };
  };
  const notSeedByePosition = (drawPosition) => !seedOrderByePositions.includes(drawPosition);
  const unfilledDrawPosition = (drawPosition) => !filledRelevantDrawPositions?.includes(drawPosition);
  const quarterSeparateBlock = (block) => {
    const sortedChunked = chunkArray(block.sort(numericSort), Math.ceil(block.length / 4));
    let filteredChunks = sortedChunked.map((chunk) => chunk.filter(unfilledDrawPosition));
    const drawPositionCount = filteredChunks.flat(Infinity).flat().length;
    const orderedDrawPositions: number[] = [];
    for (let i = 0; i < drawPositionCount; i++) {
      const { newlyFilteredChunks, drawPosition } = getNextDrawPosition(filteredChunks);
      orderedDrawPositions.push(drawPosition);
      filteredChunks = newlyFilteredChunks;
    }
    return orderedDrawPositions;
  };

  // The goal here is to get an order for assigning bye positions which is well distributed
  // setting allPositions: true returns seedBlocks for all positions
  // overriding the default which returns only seedBlocks for seedsCount
  const { validSeedBlocks } = getValidSeedBlocks({
    provisionalPositioning,
    allPositions: true,
    appliedPolicies,
    drawDefinition,
    structure,
  });

  const validBlockDrawPositions = validSeedBlocks?.map((block) =>
    block.drawPositions?.map((drawPosition) => drawPosition + drawPositionOffset),
  );

  let unfilledSeedBlocks;

  if (isFeedIn) {
    // FEED_IN structures calculate seedDrawPositions uniquely
    // and require a special case to properly calculate bye positions
    const baseDrawSize = relevantDrawPositions.length;
    const { seedBlocks } = getSeedBlocks({
      cluster: [CLUSTER, ADJACENT].includes(getSeedPattern(seedingProfile)),
      participantsCount: baseDrawSize,
    });
    const blockDrawPositions = seedBlocks.map((seedBlock) =>
      seedBlock.map((drawPosition) => drawPosition + drawPositionOffset),
    );

    unfilledSeedBlocks = blockDrawPositions.map(quarterSeparateBlock).filter((block) => block.length);
  } else if (isQualifying) {
    unfilledSeedBlocks = validBlockDrawPositions?.map((block) => block.filter(unfilledDrawPosition));
  } else {
    if (isLuckyStructure) {
      //
    }
    unfilledSeedBlocks = validBlockDrawPositions?.map(quarterSeparateBlock).filter((block) => block.length);
  }

  // for Round Robins pairs need to be reduced to pairs in drawPosition order
  const matchUpPairedDrawPositions = relevantMatchUps
    .map((matchUp) => matchUp.drawPositions)
    .map((pair) => pair?.sort((a, b) => a - b))
    .filter((pair) => pair?.[0] + 1 === pair?.[1]);

  const findDrawPositionPair = (drawPosition) => {
    return matchUpPairedDrawPositions.reduce((pair, candidate) => {
      return candidate.includes(drawPosition)
        ? candidate.reduce((p, c) => (c === drawPosition ? p : c), undefined)
        : pair;
    }, undefined);
  };

  let unseededByePositions = unfilledSeedBlocks
    .map((block) => block.map(findDrawPositionPair))
    .flat(Infinity)
    .filter(unfilledDrawPosition)
    .filter(notSeedByePosition)
    .filter(Boolean);

  if (isQualifying && !structure.structures) {
    // need to know how many qualifying blocks so that unseededByePositions can be shuffled
    // (after removing blocks.length time blocks which had seeds placed)
    // console.log(validBlockDrawPositions.length, unseededByePositions.length);
    const seedingOverhang = seedLimit % 4;
    const overhangDrawPositions = unseededByePositions.slice(0, seedingOverhang);
    const qualifierBlocksCount = roundMatchUps[structure.roundLimit]?.length;
    const shuffledRemainder = chunkArray(unseededByePositions.slice(seedingOverhang), qualifierBlocksCount).flatMap(
      (chunk) => shuffleArray(chunk, random),
    );
    unseededByePositions = overhangDrawPositions.concat(shuffledRemainder);
  }

  return { unseededByePositions };
}
