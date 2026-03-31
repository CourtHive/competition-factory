import { chunkArray, shuffleArray } from '@Tools/arrays';
import { isOdd } from '@Tools/math';

/*
  seedBlocks for 32 seeds in a draw of 128 are as follows:

  [
    { drawPositions: [ 1 ], seedNumbers: [ 1 ] },
    { drawPositions: [ 128 ], seedNumbers: [ 2 ] },
    { drawPositions: [ 33, 96 ], seedNumbers: [ 3, 4 ] },
    { drawPositions: [ 17, 49, 80, 112 ], seedNumbers: [ 5, 6, 7, 8 ] },
    {
      drawPositions: [ 9, 25,  41,  57, 72, 88, 104, 120 ],
      seedNumbers: [ 9, 10, 11, 12, 13, 14, 15, 16 ] },
    {
      drawPositions: [ 5,  13, 21, 29, 37, 45, 53, 61, 68, 76, 84, 92, 100, 108, 116, 124 ],
      seedNumbers: [ 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 ]
    }
  ]

  When the number of BYEs to be distributed for a seedBlock is LESS than the number of seed position in the block
  it is necessary to evenly distribute the BYEs across all divisions, e.g. 1/2, 1/4, 1/8

  For instance, in a draw of 128 with 116 participants there are 12 BYEs.  The first 8 BYEs are consumed by the
  first four seedBlocks leaving 4 BYEs to b distributed  across the 8 drawPositions claimed by seeds 9-16.

  The drawPositions for seeds 9-16 are:
  [ 9, 25,  41,  57, 72, 88, 104, 120 ]

  These are sorted low to high and grouped in chunks of 2 drawPositions: 
  [9, 25],  [41,  57], [72, 88], [104, 120]

  These are then transformed into nested arrays which are each level an array of 2 items:
  [[9, 25],  [41, 57]], [[72, 88], [104, 120]]

  This nesting corresponds to the initial round of elimination structures which always contains power-of-2 drawPositions

  An even distribution of BYEs to seeded drawPositions is achieved by iteratively popping a drawPosition from the nested structure,
  at each level comparing the flattened length of the 2 items of the array

  For comparison, the nesting of seed 17-32 would be as follows:
  [[[5,  13], [21, 29]], [[37, 45], [53, 61]]], [[[68, 76], [84, 92]], [[100, 108], [116, 124]]],
 */

interface SeedBlock {
  drawPositions: number[];
  seedNumbers: number[];
}

export function getBlockSortedRandomDrawPositions({
  orderedSortedFirstRoundSeededDrawPositions: strictOrder,
  validSeedBlocks,
  byesToPlace,
  random,
}: {
  orderedSortedFirstRoundSeededDrawPositions: number[];
  validSeedBlocks: SeedBlock[];
  byesToPlace: number;
  random?: () => number;
}) {
  const rng = random ?? Math.random;
  const drawPositions: number[] = [];

  validSeedBlocks.forEach((seedBlock) => processSeedBlock(seedBlock, byesToPlace, drawPositions, strictOrder, rng));
  const blockSortedRandom = drawPositions.map((p) => (Array.isArray(p) ? shuffleArray(p, random) : p)).flat(Infinity);

  if (isOdd(byesToPlace)) {
    const blockFirstSeedNumbers = validSeedBlocks.map((block) => block.seedNumbers[0]);
    if (blockFirstSeedNumbers.includes(byesToPlace)) return strictOrder;
  }

  return blockSortedRandom;
}

function processSeedBlock(seedBlock: SeedBlock, byesToPlace: number, drawPositions: number[], strictOrder: number[], rng: () => number) {
  const leftToPlace = byesToPlace - drawPositions.length;
  if (leftToPlace > seedBlock.drawPositions.length) {
    drawPositions.push(...seedBlock.drawPositions);
  } else {
    const nestedDrawPositions = nestArray(chunkArray(seedBlock.drawPositions, 2));
    placeDrawPositions(nestedDrawPositions, drawPositions, strictOrder, rng);
  }
}

function placeDrawPositions(nestedDrawPositions: any[], drawPositions: number[], strictOrder: number[], rng: () => number) {
  let drawPosition: number | undefined;
  let desiredPosition = strictOrder[drawPositions.length];
  while ((drawPosition = popFromLargerSide(nestedDrawPositions, desiredPosition, rng))) {
    drawPositions.push(drawPosition);
    desiredPosition = strictOrder[drawPositions.length];
  }
}

// desiredPosition is provided by strict seed order bye placement
// when the sides are balanced, side selection is driven by desiredPosition

function popFromLargerSide(arr, desiredPosition, rng: () => number) {
  if (Array.isArray(arr) && arr.length !== 2) return arr.pop();
  if (!Array.isArray(arr[0])) {
    return handleNonNestedArray(arr, desiredPosition, rng);
  }

  return handleNestedArray(arr, desiredPosition, rng);
}

function handleNonNestedArray(arr, desiredPosition, rng) {
  if (arr.includes(desiredPosition)) return arr.indexOf(desiredPosition) ? arr.pop() : arr.shift();

  return Math.round(rng()) ? arr.pop() : arr.shift();
}

function handleNestedArray(arr, desiredPosition, rng) {
  const side1 = arr[0].flat(Infinity).length;
  const side2 = arr[1].flat(Infinity).length;
  if (side1 === side2) {
    const desiredSide = arr[0].flat(Infinity).includes(desiredPosition) ? arr[0] : arr[1];
    if (desiredPosition) return popFromLargerSide(desiredSide, desiredPosition, rng);

    return popFromLargerSide(arr[Math.round(rng())], desiredPosition, rng);
  }
  return side1 < side2 ? popFromLargerSide(arr[1], desiredPosition, rng) : popFromLargerSide(arr[0], desiredPosition, rng);
}

function nestArray(arr) {
  const midPoint = Math.floor(arr.length / 2);
  return arr.length > 2 ? [nestArray(arr.slice(0, midPoint)), nestArray(arr.slice(midPoint))] : arr;
}
