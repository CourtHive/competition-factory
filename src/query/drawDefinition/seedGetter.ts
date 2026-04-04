import { generateBlockPattern, getSubBlock } from '@Assemblies/generators/drawDefinitions/generateBlockPattern';
import { getPositionAssignments, structureAssignedDrawPositions } from './positionsGetter';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getSeedBlocks, getSeedGroups } from '@Query/drawDefinition/getSeedBlocks';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getNumericSeedValue } from '@Query/drawDefinition/getNumericSeedValue';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { chunkArray, generateRange, shuffleArray } from '@Tools/arrays';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { ADJACENT, CLUSTER, CONTAINER, QUALIFYING, WATERFALL } from '@Constants/drawDefinitionConstants';
import { INVALID_SEED_POSITION, MISSING_STRUCTURE } from '@Constants/errorConditionConstants';
import { PolicyDefinitions, SeedBlock, SeedingProfile } from '@Types/factoryTypes';
import { DrawDefinition, Structure } from '@Types/tournamentTypes';

/**
 * A seedBlock is an object pairing an array of drawPositions with an array of seedNumbers { drawPositions: [], seedNumbers: []}
 * In an elimination structure The first seedBlock is { drawPositions: [1], seedNumbers: [1] }
 * In an elimination structure The second seedBlock is{ drawPositions: [drawSize], seedNumbers: [2] }
 * In an elimination structure the third seedBlock is { drawPositions: [a, b], seedNumbers: [3, 4] }
 * In an elimination structure the fourth seedBlock is { drawPositions: [w, x, y, z], seedNumbers: [5, 6, 7, 8] }
 * The calculations for the positioning of [a, b] and [w, x, y, z] are specific to seeding policies
 */

type GetValidSeedBlocksArgs = {
  appliedPolicies?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  drawDefinition?: DrawDefinition;
  seedingProfile?: SeedingProfile;
  returnAllProxies?: boolean;
  allPositions?: boolean;
  structure: Structure;
  random?: () => number;
};

export function getValidSeedBlocks({
  provisionalPositioning,
  returnAllProxies,
  appliedPolicies,
  seedingProfile,
  drawDefinition,
  allPositions,
  structure,
  random,
}: GetValidSeedBlocksArgs) {
  let validSeedBlocks: SeedBlock[] = [];

  if (!structure) return { error: MISSING_STRUCTURE };

  const { matchUps, roundMatchUps } = getAllStructureMatchUps({
    matchUpFilters: { roundNumbers: [1] },
    provisionalPositioning,
    structure,
  });
  const { seedAssignments } = getStructureSeedAssignments({
    provisionalPositioning,
    returnAllProxies,
    drawDefinition,
    structure,
  });
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const positionsCount = positionAssignments?.length;
  const seedsCount = seedAssignments?.length ?? 0;

  let allDrawPositions: number[] = [];
  const roundNumbers = Object.keys(roundMatchUps)
    .map((n) => Number.parseInt(n))
    .sort((a, b) => a - b);
  const uniqueDrawPositionsByRound = roundNumbers
    .map((roundNumber) => {
      const roundDrawPositions: any[] = roundMatchUps[roundNumber]
        .map((matchUp) => matchUp.drawPositions)
        .flat(Infinity)
        .filter(Boolean);
      const uniqueRoundDrawPositions = roundDrawPositions.filter(
        (drawPosition) => !allDrawPositions.includes(drawPosition),
      );
      allDrawPositions = allDrawPositions.concat(...roundDrawPositions);
      return uniqueRoundDrawPositions;
    })
    .filter((f) => f.length)
    .reverse();

  const firstRoundDrawPositions = uniqueDrawPositionsByRound.pop() ?? [];
  const firstRoundDrawPositionOffset = (firstRoundDrawPositions && Math.min(...firstRoundDrawPositions) - 1) || 0;

  seedingProfile = seedingProfile ?? appliedPolicies?.seeding?.seedingProfile;
  const baseDrawSize = firstRoundDrawPositions?.length || 0;

  // firstRoundDrawPositions have been popped
  // seedRangeDrawPositionBlocks determines FEED_IN
  const seedRangeDrawPositionBlocks = uniqueDrawPositionsByRound.filter(
    (block) => block.filter((drawPosition) => drawPosition <= seedsCount).length,
  );

  const { stage, structureType, roundLimit } = structure;
  const isContainer = structureType === CONTAINER;
  const isFeedIn = !isContainer && uniqueDrawPositionsByRound?.length;
  const qualifyingBlocks = !isContainer && stage === QUALIFYING && roundLimit;

  const fedSeedBlockPositions = seedRangeDrawPositionBlocks.flat(Infinity);
  const fedSeedNumberOffset = isFeedIn ? fedSeedBlockPositions?.length : 0;
  const countLimit = allPositions ? positionsCount : seedsCount;
  const isLuckyStructure = isLucky({
    drawDefinition,
    structure,
    matchUps,
  });
  const firstRoundSeedsCount = isLuckyStructure
    ? 0
    : (!isFeedIn && countLimit) ||
      (countLimit && fedSeedBlockPositions.length < countLimit && countLimit - fedSeedBlockPositions.length) ||
      0;

  if (qualifyingBlocks) {
    const seedingBlocksCount = structure?.matchUps
      ? structure.matchUps.filter(({ roundNumber }) => roundNumber === structure.roundLimit).length
      : 0;
    const chunkSize = firstRoundDrawPositions.length / seedingBlocksCount;

    if (!isFeedIn) {
      const positioning = getSeedPattern(seedingProfile);
      const drawPositionChunks = chunkArray(firstRoundDrawPositions, chunkSize);
      let groupNumber = 1;
      const seedGroups = generateRange(0, drawPositionChunks[0].length).map(() => {
        const seedNumbers = generateRange(groupNumber, groupNumber + drawPositionChunks.length);
        groupNumber += drawPositionChunks.length;
        return seedNumbers;
      });

      ({ validSeedBlocks } = getSeedBlockPattern({
        drawPositionBlocks: drawPositionChunks,
        nonRandom: seedingProfile?.nonRandom,
        positioning,
        seedGroups,
        random,
      }));
    }
  } else if (isContainer) {
    const result = getContainerBlocks({
      nonRandom: seedingProfile?.nonRandom,
      seedingProfile,
      structure,
      random,
    });
    ({ validSeedBlocks } = result);
  } else if (isFeedIn) {
    // for FEED_IN structures, block seeding proceeds from final rounds
    // to earlier rounds.  If there are more seeds than fed positions,
    // then seeds must be assigned to first round drawPositions
    validSeedBlocks = seedRangeDrawPositionBlocks.map((block) => {
      return { seedNumbers: block, drawPositions: block };
    });
  } else if (isLuckyStructure) {
    const blocks = chunkArray(firstRoundDrawPositions, 2).map((block, i) => ({
      drawPositions: [block[0]],
      seedNumbers: [i + 1],
    }));
    blocks.forEach((block) => validSeedBlocks.push(block));
  }

  if (!isContainer && !isLuckyStructure && !qualifyingBlocks) {
    const { blocks } = constructPower2Blocks({
      drawPositionOffset: firstRoundDrawPositionOffset,
      seedNumberOffset: fedSeedNumberOffset,
      seedCountGoal: firstRoundSeedsCount,
      seedingProfile,
      baseDrawSize,
    });
    blocks.forEach((block) => validSeedBlocks.push(block));
  }

  const seedDrawPositions: any[] = validSeedBlocks.flatMap((seedBlock) => seedBlock.drawPositions);
  const validSeedPositions = seedDrawPositions.reduce((result, drawPosition) => {
    return firstRoundDrawPositions?.includes(drawPosition) && result;
  }, true);

  if (!isLuckyStructure && !isFeedIn && !isContainer && !validSeedPositions) {
    return {
      error: INVALID_SEED_POSITION,
      validSeedBlocks: [],
      isContainer,
      isFeedIn,
    };
  }

  return {
    isLuckyStructure,
    validSeedBlocks,
    isContainer,
    isFeedIn,
  };
}

export function getContainerBlocks({ seedingProfile, structure, nonRandom, random }) {
  const containedStructures = structure.structures ?? [];
  const roundRobinGroupsCount = containedStructures.length;
  const positionAssignments = getPositionAssignments({
    structure,
  })?.positionAssignments;
  const positioning = getSeedPattern(seedingProfile);

  const drawSize = positionAssignments?.length ?? 0;
  const { seedGroups } = getSeedGroups({
    roundRobinGroupsCount,
    drawSize,
  });
  const drawPositionBlocks = containedStructures.map((containedStructure) =>
    getPositionAssignments({
      structure: containedStructure,
    }).positionAssignments?.map((assignment) => assignment.drawPosition),
  );

  return getSeedBlockPattern({
    drawPositionBlocks,
    positioning,
    seedGroups,
    nonRandom,
    random,
  });
}

type GetSeedBlockPatternArgs = {
  drawPositionBlocks: number[][];
  seedGroups: number[][];
  positioning?: string;
  nonRandom?: boolean;
  random?: () => number;
};

export function getSeedBlockPattern({
  drawPositionBlocks,
  positioning,
  seedGroups,
  nonRandom,
  random,
}: GetSeedBlockPatternArgs) {
  const validSeedBlocks: SeedBlock[] = [];

  const { divisionGroupings } = generateBlockPattern({
    size: seedGroups.length,
    positioning,
  });

  const assignedPositions: number[] = [];
  seedGroups.forEach((seedGroup, i) => {
    const relativePositions = getSubBlock({
      blockPattern: divisionGroupings,
      index: i,
    });
    seedGroup.forEach((seedNumber: number, j) => {
      const blockIndex = i % 2 ? drawPositionBlocks.length - j - 1 : j;
      const block = drawPositionBlocks[blockIndex].slice();
      let consideredDrawPositions = block.filter(
        (drawPosition, i) => relativePositions.includes(i + 1) && drawPosition,
      );
      if (positioning !== WATERFALL) {
        consideredDrawPositions = nonRandom ? consideredDrawPositions : shuffleArray(consideredDrawPositions, random);
      } else if (i % 2) {
        consideredDrawPositions.reverse();
      }
      const drawPosition = consideredDrawPositions.find((drawPosition) => !assignedPositions.includes(drawPosition));

      if (drawPosition) {
        assignedPositions.push(drawPosition);
        validSeedBlocks.push({
          drawPositions: [drawPosition],
          seedNumbers: [seedNumber],
        });
      }
    });
  });

  return { validSeedBlocks };
}

function constructPower2Blocks(params) {
  const {
    drawPositionOffset = 0,
    roundRobinGroupsCount,
    seedNumberOffset = 0,
    seedingProfile,
    seedCountGoal,
    baseDrawSize,
  } = params;

  let count: number;
  const blocks: any[] = [];

  const { seedBlocks } = getSeedBlocks({
    cluster: [CLUSTER, ADJACENT].includes(getSeedPattern(seedingProfile)),
    participantsCount: baseDrawSize,
    roundRobinGroupsCount,
  });

  count = 0;
  for (const seedBlock of seedBlocks) {
    if (count + 1 > seedCountGoal) break;
    const drawPositions = seedBlock.map((drawPosition) => drawPosition + drawPositionOffset);
    const seedNumbers = getSeeds(count + 1, seedBlock.length).map((seedNumber) => +seedNumber + seedNumberOffset);
    count += seedBlock.length;
    blocks.push({ drawPositions, seedNumbers });
  }

  return { blocks };
}

function getSeeds(s: number, n: number) {
  return Array.from(new Array(n), (_, i) => i + s);
}

/**
 * method operates in three modes:
 * 1. Lenient (default) - any valid seed number can go in any valid seed position
 * 2. Ignore - method is bypassed and always returns true
 * 3. Strict - drawPosition is only valid if it is found in seedBlock which contains seedNumber
 */

type IsValidSeedPositionArgs = {
  appliedPolicies?: PolicyDefinitions;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  seedBlockInfo?: any;
  structureId: string;
  seedNumber?: number;
};

export function isValidSeedPosition({
  appliedPolicies,
  drawDefinition,
  seedBlockInfo,
  drawPosition,
  structureId,
  seedNumber,
}: IsValidSeedPositionArgs) {
  const { structure } = findStructure({ drawDefinition, structureId });
  appliedPolicies ??= getAppliedPolicies({ drawDefinition }).appliedPolicies;

  let validSeedBlocks = seedBlockInfo?.validSeedBlocks;

  if (!validSeedBlocks && structure) {
    validSeedBlocks = getValidSeedBlocks({
      appliedPolicies,
      drawDefinition,
      structure,
    })?.validSeedBlocks;
  }

  if (appliedPolicies?.seeding?.validSeedPositions?.ignore) return true;
  if (appliedPolicies?.seeding?.validSeedPositions?.strict) {
    const targetSeedBlock = validSeedBlocks.find((seedBlock) => seedBlock.seedNumbers.includes(seedNumber));
    const validSeedPositions = targetSeedBlock?.drawPositions ?? [];
    return validSeedPositions.includes(drawPosition);
  }

  const validSeedPositions: number[] = validSeedBlocks.flatMap((seedBlock) => seedBlock.drawPositions);
  return validSeedPositions.includes(drawPosition);
}

export function getNextSeedBlock(params) {
  const { provisionalPositioning, drawDefinition, seedingProfile, seedBlockInfo, structureId, randomize, random } = params;

  const { structure } = findStructure({ drawDefinition, structureId });
  const { seedAssignments } = getStructureSeedAssignments({
    returnAllProxies: params.returnAllProxies,
    provisionalPositioning,
    drawDefinition,
    structure,
  });
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const positionsWithParticipants = positionAssignments?.filter(
    (assignment) => assignment.participantId ?? assignment.bye ?? assignment.qualifier,
  );
  const assignedDrawPositions = positionsWithParticipants?.map((assignment) => assignment.drawPosition).filter(Boolean);

  const { appliedPolicies } = getAppliedPolicies({ drawDefinition });
  const validSeedBlocks =
    seedBlockInfo?.validSeedBlocks ||
    (structure &&
      getValidSeedBlocks({
        returnAllProxies: params.returnAllProxies,
        provisionalPositioning,
        appliedPolicies,
        drawDefinition,
        seedingProfile,
        structure,
      })?.validSeedBlocks);
  const nextSeedBlock = (validSeedBlocks ?? []).find((seedBlock) => {
    const unfilledPositions = seedBlock.drawPositions.filter(
      (drawPosition) => !assignedDrawPositions?.includes(drawPosition),
    );
    return unfilledPositions.length;
  });

  const assignedSeedParticipantIds = seedAssignments?.map((assignment) => assignment.participantId).filter(Boolean);
  const assignedPositionParticipantIds = positionAssignments
    ?.map((assignment) => assignment.participantId)
    .filter(Boolean);
  const placedSeedParticipantIds = assignedSeedParticipantIds?.filter((participantId) =>
    assignedPositionParticipantIds?.includes(participantId),
  );

  const unplacedSeedIds = assignedSeedParticipantIds?.filter(
    (participantId) => !assignedPositionParticipantIds?.includes(participantId),
  );

  const unplacedSeedAssignments = seedAssignments?.filter((assignment) =>
    unplacedSeedIds?.includes(assignment.participantId),
  );

  const seedsWithoutDrawPositions = seedAssignments?.filter((assignment) => !assignment.participantId);
  const seedsLeftToAssign =
    unplacedSeedAssignments?.length && unplacedSeedAssignments.length > 0
      ? unplacedSeedAssignments.length
      : (seedsWithoutDrawPositions?.length ?? 0);
  const unfilled =
    (seedsLeftToAssign &&
      nextSeedBlock?.drawPositions.filter((drawPosition) => !assignedDrawPositions?.includes(drawPosition))) ||
    [];
  const unfilledPositions = randomize ? shuffleArray(unfilled, random) : unfilled;
  const selectedParticipantIds: string[] = [];
  const randomlySelectedUnplacedSeedValueIds = unfilledPositions
    .map(() => {
      const assignment = randomlySelectLowestSeedValue(unplacedSeedAssignments, selectedParticipantIds);
      const participantId = assignment?.participantId;
      if (participantId) selectedParticipantIds.push(participantId);
      return participantId;
    })
    .filter(Boolean);

  const placedSeedNumbers = seedAssignments
    ?.filter((assignment) => placedSeedParticipantIds?.includes(assignment.participantId))
    .map((assignment) => assignment.seedNumber);
  const blockSeedNumbers = nextSeedBlock?.seedNumbers ?? [];

  // unplacedSeedNumbers and unplacedSeedNumberIds will only be used
  // when policy specifies that seedNumbers/seedValues must be unique
  const unplacedSeedNumbers = blockSeedNumbers.filter((seedNumber) => !placedSeedNumbers?.includes(seedNumber));

  const unplacedSeedNumberIds = seedAssignments
    ?.filter((assignment) => unplacedSeedNumbers.includes(assignment.seedNumber))
    .map((assignment) => assignment.participantId);

  const duplicateSeedNumbers = appliedPolicies?.seeding?.duplicateSeedNumbers;
  const allowsDuplicateSeedNumbers = typeof duplicateSeedNumbers === 'boolean' ? duplicateSeedNumbers : true;

  const unplacedSeedParticipantIds = allowsDuplicateSeedNumbers
    ? randomlySelectedUnplacedSeedValueIds
    : unplacedSeedNumberIds;

  return {
    nextSeedBlock,
    unplacedSeedParticipantIds,
    unplacedSeedNumbers,
    unfilledPositions,
    unplacedSeedAssignments,
  };

  function randomlySelectLowestSeedValue(assignments, selectedParticipantIds) {
    const filteredAssignments = assignments.filter(
      (assignment) => !selectedParticipantIds.includes(assignment.participantId),
    );
    const lowestSeedValue = Math.min(
      ...filteredAssignments.map((assignment) => getNumericSeedValue(assignment.seedValue)),
    );
    const assignmentsWithLowestSeedValue = filteredAssignments.filter(
      (assignment) => getNumericSeedValue(assignment.seedValue) === lowestSeedValue,
    );
    const randomizedAssignments = shuffleArray(assignmentsWithLowestSeedValue, random);
    return randomizedAssignments.pop();
  }
}

export function getSeedPattern(seedingProfile) {
  if (typeof seedingProfile === 'string') return seedingProfile;
  if (typeof seedingProfile === 'object') return seedingProfile.positioning;
}
