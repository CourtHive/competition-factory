import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { getQualifiersData } from '@Mutate/matchUps/drawPositions/positionQualifiers';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getSeedOrderByePositions } from './getSeedOrderedByePositions';
import { getUnseededByePositions } from './getUnseededByePositions';
import { getByesData } from '@Query/drawDefinition/getByesData';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findStructure } from '@Acquire/findStructure';
import { shuffleArray } from '@Tools/arrays';

// constants and types
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, SeedingProfile, MatchUpsMap } from '@Types/factoryTypes';
import { CONTAINER, ITEM, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SeedBlockInfo } from '@Query/drawDefinition/seedGetter';
import { SUCCESS } from '@Constants/resultConstants';

type PositionByesArgs = {
  appliedPolicies?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  seedingProfile?: SeedingProfile;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  structureId?: string;
  qualifiersCount?: number;
  seedBlockInfo?: SeedBlockInfo;
  seedsOnly?: boolean;
  seedLimit?: number;
  event?: Event;
  random?: () => number;
};
export function positionByes({
  provisionalPositioning,
  tournamentRecord,
  appliedPolicies,
  qualifiersCount,
  drawDefinition,
  seedBlockInfo,
  seedingProfile,
  matchUpsMap,
  structureId,
  structure,
  seedLimit,
  seedsOnly,
  event,
  random,
}: PositionByesArgs) {
  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (!structureId) structureId = structure.structureId;

  const blockOrdered = !(structuresOf(structure) ?? structure?.stage === QUALIFYING);

  const { byesCount, placedByes, relevantMatchUps } = getByesData({
    provisionalPositioning,
    qualifiersCount,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });
  const byesToPlace = byesCount - (placedByes || 0);
  if (byesToPlace <= 0) return { ...SUCCESS };

  // LUCKY_DRAW: BYE positions are simply the unfilled first-round draw positions
  if (isLuckyBasedDraw(drawDefinition.drawType)) {
    const firstRoundPositions = (relevantMatchUps ?? []).flatMap((m) => m.drawPositions ?? []).filter(Boolean);
    const filledPositions = new Set(
      positionAssignmentsOf(structure)
        ?.filter((a) => a.participantId)
        .map((a) => a.drawPosition) ?? [],
    );
    const byeDrawPositions = firstRoundPositions.filter((dp) => !filledPositions.has(dp)).slice(0, byesToPlace);

    for (const drawPosition of byeDrawPositions) {
      const result = assignDrawPositionBye({
        provisionalPositioning,
        tournamentRecord,
        drawDefinition,
        drawPosition,
        matchUpsMap,
        structureId,
        structure,
        event,
      });
      if (result?.error) return result;
    }

    return { ...SUCCESS, byeDrawPositions };
  }

  const { strictSeedOrderByePositions, blockSeedOrderByePositions, isLuckyStructure, isFeedIn } =
    getSeedOrderByePositions({
      provisionalPositioning,
      relevantMatchUps,
      appliedPolicies,
      drawDefinition,
      seedingProfile,
      seedBlockInfo,
      byesToPlace,
      structure,
    });

  const ignoreSeededByes =
    structure?.structureType &&
    [CONTAINER, ITEM].includes(structure.structureType) &&
    appliedPolicies?.seeding?.containerByesIgnoreSeeding;

  const seedOrderByePositions =
    blockOrdered && blockSeedOrderByePositions?.length ? blockSeedOrderByePositions : strictSeedOrderByePositions;

  let { unseededByePositions } = getUnseededByePositions({
    provisionalPositioning,
    seedOrderByePositions,
    isLuckyStructure,
    appliedPolicies,
    drawDefinition,
    seedLimit,
    structure,
    isFeedIn,
    random,
  });

  const isOdd = (x) => x % 2;
  // method determines whether candidate c is paired to elements in an array
  const isNotPaired = (arr, c) => (arr ?? []).every((a) => (isOdd(a) ? c !== a + 1 : c !== a - 1));

  // first add all drawPositions paired with sorted seeds drawPositions
  // then add quarter separated and evenly distributed drawPositions
  // derived from theoretical seeding of firstRoundParticipants
  // HOWEVER, if separated and evenly distributed drawPositions result
  // in a BYE/BYE pairing, prioritize remaining unpaired positions
  let byePositions: number[] = seedOrderByePositions.flat();

  if (!seedsOnly) {
    while (unseededByePositions.length) {
      const unPairedPosition = unseededByePositions.find((position) => isNotPaired(byePositions, position));
      if (unPairedPosition) {
        byePositions.push(unPairedPosition);
        unseededByePositions = unseededByePositions.filter((position) => position !== unPairedPosition);
      } else {
        byePositions.push(...unseededByePositions);
        unseededByePositions = [];
      }
    }
  }

  if (ignoreSeededByes) {
    byePositions = shuffleArray(byePositions, random);
    pushGlobalLog({ method: 'positionByes', byePositions });
  }

  // then take only the number of required byes, leaving the qualifiers their room
  const byeDrawPositions = leaveRoomForQualifiers({
    drawDefinition,
    qualifiersCount,
    byePositions,
    byesToPlace,
    structure,
  });

  for (const drawPosition of byeDrawPositions) {
    const result = assignDrawPositionBye({
      provisionalPositioning,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      structureId,
      structure,
      event,
    });
    if (result?.error) return result;
  }

  return { ...SUCCESS, unseededByePositions, byeDrawPositions };
}

type LeaveRoomForQualifiersArgs = {
  drawDefinition: DrawDefinition;
  qualifiersCount?: number;
  byePositions: number[];
  byesToPlace: number;
  structure: Structure;
};

/**
 * BYEs are drawn from first-round positions, but qualifiers enter only the round their link targets.
 * In a FEED_IN the first round holds just some of the drawPositions, so more BYEs than it can spare
 * left the qualifiers no room (FEED_IN 22 with 8 qualifiers and 4 entrants: 10 BYEs into 16 first
 * round positions, 6 left for 8 qualifiers). Cap the BYEs in each qualifier target round at what that
 * round can spare, and place the rest on open positions in rounds no qualifier enters: a feed round's
 * fed positions, where a BYE carries the previous round's winner through.
 */
function leaveRoomForQualifiers({
  drawDefinition,
  qualifiersCount,
  byePositions,
  byesToPlace,
  structure,
}: LeaveRoomForQualifiersArgs): number[] {
  // positions keyed by round number, not a matchUp's sides
  const {
    roundDrawPositions: positionsByRound,
    unplacedRoundQualifierCounts,
    positionAssignments,
  } = getQualifiersData({
    drawDefinition,
    qualifiersCount,
    structure,
  });
  const targetRounds = Object.keys(unplacedRoundQualifierCounts).filter(
    (roundNumber) => unplacedRoundQualifierCounts[roundNumber] > 0,
  );
  if (!targetRounds.length) return byePositions.slice(0, byesToPlace);

  const open = new Set<number>(
    (positionAssignments ?? [])
      .filter((assignment) => !assignment.participantId && !assignment.bye && !assignment.qualifier)
      .map((assignment) => assignment.drawPosition),
  );
  const spare: Record<string, number> = {};
  const roundOf: Record<number, string> = {};
  for (const roundNumber of targetRounds) {
    const roundPositions: number[] = positionsByRound[roundNumber] ?? [];
    roundPositions.forEach((drawPosition) => (roundOf[drawPosition] = roundNumber));
    const openInRound = roundPositions.filter((drawPosition) => open.has(drawPosition)).length;
    spare[roundNumber] = openInRound - unplacedRoundQualifierCounts[roundNumber];
  }

  const chosen: number[] = [];
  for (const drawPosition of byePositions) {
    if (chosen.length === byesToPlace) break;
    const roundNumber = roundOf[drawPosition];
    if (roundNumber && spare[roundNumber] <= 0) continue;
    if (roundNumber) spare[roundNumber] -= 1;
    chosen.push(drawPosition);
  }

  const elsewhere = [...open]
    .filter((drawPosition) => !roundOf[drawPosition] && !chosen.includes(drawPosition))
    .sort((a, b) => a - b);
  while (chosen.length < byesToPlace && elsewhere.length) chosen.push(elsewhere.shift() as number);

  return chosen;
}
