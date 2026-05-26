import { getRoundRobinGroupMatchUps, drawPositionsHash, groupRounds } from './roundRobinGroups';
import { structureTemplate } from '@Generators/templates/structureTemplate';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { constantToString } from '@Tools/strings';
import { generateRange } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

// constants and types
import { PlayoffAttributes, PolicyDefinitions, SeedingProfile, ResultType } from '@Types/factoryTypes';
import { MAIN, ITEM, WIN_RATIO, CONTAINER } from '@Constants/drawDefinitionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MatchUp, EventTypeUnion, TieFormat } from '@Types/tournamentTypes';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type GenerateRoundRobinArgs = {
  playoffAttributes?: PlayoffAttributes;
  hasExistingDrawDefinition?: boolean;
  appliedPolicies?: PolicyDefinitions;
  seedingProfile?: SeedingProfile;
  matchUpType?: EventTypeUnion;
  qualifyingOnly?: boolean;
  groupNameBase?: string;
  structureName?: string;
  stageSequence?: number;
  structureOptions?: any;
  tieFormat?: TieFormat;
  groupNames?: string[];
  roundTarget?: number;
  structureId?: string;
  drawSize: number;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
  stage?: string;
};

export function generateRoundRobin(params: GenerateRoundRobinArgs) {
  const {
    hasExistingDrawDefinition,
    groupNameBase = 'Group',
    playoffAttributes,
    stageSequence = 1,
    structureOptions,
    appliedPolicies,
    qualifyingOnly,
    seedingProfile,
    stage = MAIN,
    matchUpType,
    roundTarget,
    structureId,
    groupNames,
    tieFormat,
    drawSize,
    idPrefix,
    isMock,
    uuids,
  } = params;

  const structureName = params.structureName ?? playoffAttributes?.['0']?.name ?? constantToString(MAIN);

  const { groupCount, groupSize } = deriveGroups({
    structureOptions,
    appliedPolicies,
    drawSize,
  });

  const finishingPosition = WIN_RATIO;

  let maxRoundNumber;

  const structures = generateRange(1, groupCount + 1).map((structureOrder) => {
    const matchUps: HydratedMatchUp[] = roundRobinMatchUps({
      groupSize: groupSize,
      structureOrder,
      matchUpType,
      drawSize,
      idPrefix,
      isMock,
    });
    maxRoundNumber = Array.isArray(matchUps) ? Math.max(...matchUps.map(({ roundNumber }) => roundNumber ?? 0)) : 0;

    const structureName = groupNames?.[structureOrder - 1] ?? `${groupNameBase} ${structureOrder}`;

    return structureTemplate({
      structureId: uuids?.pop(),
      hasExistingDrawDefinition,
      structureType: ITEM,
      finishingPosition,
      qualifyingOnly,
      structureOrder,
      structureName,
      tieFormat,
      matchUps,
      stage,
    });
  });

  const structure = structureTemplate({
    structureId: structureId ?? uuids?.pop(),
    hasExistingDrawDefinition,
    structureType: CONTAINER,
    finishingPosition,
    seedingProfile,
    structureName,
    stageSequence,
    structures,
    tieFormat,
    stage,
  });

  if (roundTarget)
    setFirstClassOrExtension({
      element: structure,
      attribute: 'roundTarget',
      name: ROUND_TARGET,
      value: roundTarget,
    });

  return {
    structures: [structure],
    maxRoundNumber,
    groupCount,
    links: [],
    groupSize,
    ...SUCCESS,
  };
}

function deriveGroups({ appliedPolicies, structureOptions, drawSize }) {
  if (appliedPolicies) {
    // check for applied policies
  }

  let groupSize = structureOptions?.groupSize;
  const groupSizeLimit = structureOptions?.groupSizeLimit || 8;
  const { validGroupSizes } = getValidGroupSizes({
    groupSizeLimit,
    drawSize,
  });
  const maxValidGroupSize = validGroupSizes && Math.max(...validGroupSizes);

  const validGroupSize = groupSize && validGroupSizes?.includes(groupSize);

  if (!validGroupSize) {
    // if no groupSize specified or if groupSize is not valid
    if ((groupSize && groupSize > 4) || !validGroupSizes?.includes(4)) {
      groupSize = maxValidGroupSize;
    } else {
      groupSize = 4;
    }
  }

  const groupCount = Math.ceil(drawSize / groupSize);
  return { groupSize, groupCount };
}

type GetValidGroupSizesArgs = {
  groupSizeLimit?: number;
  drawSize: number;
};
export function getValidGroupSizes(params: GetValidGroupSizesArgs): ResultType & { validGroupSizes?: number[] } {
  const { groupSizeLimit = 10, drawSize = 0 } = params ?? {};
  const validGroupSizes = generateRange(3, groupSizeLimit + 1).filter((groupSize) => {
    const groupsCount = Math.ceil(drawSize / groupSize);
    const byesCount = groupsCount * groupSize - drawSize;
    const maxParticipantsPerGroup = Math.ceil(drawSize / groupsCount);
    const maxByesPerGroup = Math.ceil(byesCount / groupsCount);
    return (
      (!byesCount || byesCount < groupSize) &&
      maxParticipantsPerGroup === groupSize &&
      maxParticipantsPerGroup >= 3 &&
      maxByesPerGroup < 2
    );
  });
  return { ...SUCCESS, validGroupSizes };
}

type RoundRobinMatchUpsArgs = {
  structureOrder: number;
  matchUpType?: EventTypeUnion;
  groupSize: number;
  drawSize: number;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
};

function roundRobinMatchUps({
  structureOrder,
  matchUpType,
  groupSize,
  drawSize,
  idPrefix,
  isMock,
  uuids,
}: RoundRobinMatchUpsArgs): HydratedMatchUp[] {
  const drawPositionOffset = (structureOrder - 1) * groupSize;
  const drawPositions = generateRange(1 + drawPositionOffset, groupSize + 1 + drawPositionOffset);

  const uniqueMatchUpGroupings =
    getRoundRobinGroupMatchUps({
      drawPositions,
    }).uniqueMatchUpGroupings ?? [];
  const rounds: any[] = groupRounds({ groupSize, drawPositionOffset });

  const matchUps = uniqueMatchUpGroupings
    .map(positionMatchUp)
    .sort((a, b) => (a.roundNumber ?? Infinity) - (b.roundNumber ?? Infinity));

  return matchUps;

  function determineRoundNumber(hash) {
    return rounds.reduce((p, round, i) => (round.includes(hash) ? i + 1 : p), undefined);
  }

  // returns a range for array of possible finishing drawPositions
  function positionMatchUp(drawPositions) {
    const hash = drawPositionsHash(drawPositions);
    const roundNumber = determineRoundNumber(hash);
    const range = [1, drawSize];
    const matchUpId = roundRobinMatchUpId({
      structureOrder,
      drawPositions,
      roundNumber,
      idPrefix,
      uuids,
    });

    const matchUp: MatchUp = {
      matchUpStatus: roundNumber ? TO_BE_PLAYED : BYE,
      matchUpType, // does not (perhaps) need to be included; but because structures[].structure unsure about derivation inContext
      // finishingPositionRange in RR is not very useful, but provided for consistency
      finishingPositionRange: { winner: range, loser: range },
      drawPositions,
      roundNumber,
      matchUpId,
    };
    if (isMock) matchUp.isMock = true;

    return matchUp;
  }
}

function roundRobinMatchUpId({ structureOrder, drawPositions, roundNumber, idPrefix, uuids }) {
  return idPrefix
    ? `${idPrefix}-${structureOrder}-${roundNumber}-DP-${drawPositions.join('-')}`
    : uuids?.pop() || UUID();
}
