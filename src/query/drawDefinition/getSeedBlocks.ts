import { getValidGroupSizes } from '@Assemblies/generators/drawDefinitions/drawTypes/roundRobin/roundRobin';
import { chunkArray, generateRange, overlap } from '@Tools/arrays';
import { isConvertableInteger, nextPowerOf2 } from '@Tools/math';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

/**
 * Generates seedBlocks for USTA or ITF style seeding
 * In the USTA seeding pattern no seed positions are ever adjacent;
 * ...on the top of the draw seed positions are always on the top of a group of positions
 * ...on the bottom of the draw seed positions are always on the bottom of a group of positions
 * In the ITF seeding pattern seed positions alternate between top and bottom of groups of positions
 *
 * @param {number} roundRobinGroupsCount - optional - number of round robin groups
 * @param {number} participantsCount - number of participants, coerced into a valid elimination structure size
 * @param {boolean} cluster - whether to cluster seed positions (ITF)
 * @returns
 */

type GetSeedBlocksArgs = {
  roundRobinGroupsCount?: number;
  participantsCount: number;
  cluster?: boolean;
};

export function getSeedBlocks(params: GetSeedBlocksArgs): ResultType & { seedBlocks?: any; success?: boolean } {
  const { roundRobinGroupsCount, participantsCount, cluster } = params;
  if (!isConvertableInteger(participantsCount))
    return {
      seedBlocks: undefined,
      ...decorateResult({
        result: { error: INVALID_VALUES },
        context: { participantsCount },
        stack: 'getSeedBlocks',
      }),
    };

  const drawSize = nextPowerOf2(participantsCount);

  if (roundRobinGroupsCount) {
    // ensure that drawSize has not already been subdivided
    // e.g. each group treated as a separate drawSize whilst passing total groupsCount
    const increment = Math.min(roundRobinGroupsCount, drawSize);
    const seedBlocks: number[][] = [];
    let position = 1;

    generateRange(0, increment).forEach(() => {
      seedBlocks.push([position]);
      position++;
    });

    while (position < drawSize) {
      const range = generateRange(position, position + increment);
      position += increment;
      seedBlocks.push(range);
    }
    return { ...SUCCESS, seedBlocks };
  }

  const range = generateRange(1, drawSize + 1);

  const positions: number[] = [];
  let chunkSize = drawSize / 2;
  // first two seed blocks are always [[1], [drawSize]], e.g. [[1], [32]] for a 32 drawSize
  // While loop generates an array of ordered drawPositions which are later broken into blocks

  while (chunkSize > 1) {
    const chunks = chunkArray(range, chunkSize);
    const chunksCount = chunks.length;

    // for each chunk generate candidates
    // throw out candidates if the chunk positions include an already selected position
    // this has the effect of skipping chunks where seeds have already been identified
    chunks.forEach((chunk, i) => {
      let candidate;
      const top = i < chunksCount / 2;
      const isEven = i % 2 === 0;
      const first = chunk[0];
      const last = chunk[chunk.length - 1];

      if (cluster && chunksCount > 4) {
        // for ITF/CLUSTER seeding the pattern changes and then stabilizes
        if (chunksCount === 8) {
          candidate = top ? last : first;
        } else {
          candidate = isEven ? first : last;
        }
      } else {
        // for USTA/SEPARATE seeding the pattern is simple: first on top, last on bottom
        candidate = top ? first : last;
      }
      if (!overlap(chunk, positions)) {
        positions.push(candidate);
      }
    });
    chunkSize = chunkSize / 2;
  }

  const remainingPositions = range.filter((position) => !positions.includes(position));

  while (remainingPositions.length) {
    // for remaining positions alternately select from bottom/top
    if (remainingPositions.length % 2 === 0) {
      positions.push(remainingPositions.pop());
    } else {
      positions.push(remainingPositions.shift());
    }
  }

  // generate an array of seed block sizes... [1, 1, 2, 4, 8, 16...]
  // 20 ensures a more than adequate number of seedBlocks!
  const seedBlockSizes = generateRange(0, 20).map((x) => Math.pow(2, x));
  seedBlockSizes.unshift(1);
  // the number of seedBlocks is given by the index of drawSize in seedBlockSizes
  const iterations = seedBlockSizes.indexOf(drawSize);

  let sum = 0;
  const seedBlocks: number[][] = [];
  // iterate over seed block sizes to generate seedBlocks
  generateRange(0, iterations).forEach((i) => {
    seedBlocks.push(positions.slice(sum, sum + seedBlockSizes[i]));
    sum += seedBlockSizes[i];
  });

  return { ...SUCCESS, seedBlocks };
}

type GetSeedGroupsArgs = {
  roundRobinGroupsCount?: number;
  drawSize: number;
};
export function getSeedGroups({
  roundRobinGroupsCount,
  drawSize,
}: GetSeedGroupsArgs): ResultType & { seedGroups?: any } {
  const stack = 'getSeedGroups';

  if (!isConvertableInteger(drawSize))
    return {
      seedGroups: undefined,
      ...decorateResult({
        result: { error: INVALID_VALUES },
        context: { drawSize },
        stack,
      }),
    };

  if (roundRobinGroupsCount) {
    if (!isConvertableInteger(roundRobinGroupsCount))
      return {
        seedGroups: undefined,
        ...decorateResult({
          context: { roundRobinGroupsCount },
          result: { error: INVALID_VALUES },
          stack,
        }),
      };

    let seedNumber = 1;
    const roundsCount = Math.floor(drawSize / roundRobinGroupsCount);
    const seedGroups = generateRange(0, roundsCount).map(() => {
      const seedNumbers = generateRange(seedNumber, seedNumber + roundRobinGroupsCount);
      seedNumber += roundRobinGroupsCount;
      return seedNumbers;
    });
    return { seedGroups };
  } else {
    const { seedBlocks } = getSeedBlocks({
      participantsCount: drawSize,
      roundRobinGroupsCount,
    });

    let seedNumber = 0;
    const seedGroups = (seedBlocks ?? []).map((seedBlock) =>
      (seedBlock ?? []).map(() => {
        seedNumber += 1;
        return seedNumber;
      }),
    );

    return { seedGroups };
  }
}

type GetSeedingThresholdsArgs = {
  roundRobinGroupsCount?: number;
  participantsCount: number;
};
export function getSeedingThresholds({
  roundRobinGroupsCount,
  participantsCount,
}: GetSeedingThresholdsArgs): ResultType & {
  seedingThresholds?: any;
  success?: boolean;
} {
  if (roundRobinGroupsCount) {
    const { validGroupSizes } = getValidGroupSizes({
      drawSize: participantsCount,
    });
    const validGroupsCounts = validGroupSizes?.map((groupSize) => Math.ceil(participantsCount / groupSize));
    const invalid = !validGroupsCounts?.includes(roundRobinGroupsCount);

    if (invalid) {
      return decorateResult({
        context: { roundRobinGroupsCount },
        result: { error: INVALID_VALUES },
      });
    }
  }

  const { seedGroups } = getSeedGroups({
    drawSize: participantsCount,
    roundRobinGroupsCount,
  });

  const seedingThresholds = seedGroups?.map((seedNumberBlock) => Math.min(...seedNumberBlock)) ?? [];

  return { ...SUCCESS, seedingThresholds };
}
