import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getSeedOrderByePositions } from './getSeedOrderedByePositions';
import { getUnseededByePositions } from './getUnseededByePositions';
import { getByesData } from '@Query/drawDefinition/getByesData';
import { getDevContext } from '@Global/state/globalState';
import { findStructure } from '@Acquire/findStructure';
import { shuffleArray } from '@Tools/arrays';

// constants and types
import { CONTAINER, ITEM, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, SeedingProfile, MatchUpsMap } from '@Types/factoryTypes';
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
  seedBlockInfo?: any;
  seedsOnly?: boolean;
  seedLimit?: number;
  event?: Event;
};
export function positionByes({
  provisionalPositioning,
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  seedBlockInfo,
  seedingProfile,
  matchUpsMap,
  structureId,
  structure,
  seedLimit,
  seedsOnly,
  event,
}: PositionByesArgs) {
  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));
  if (!structureId) structureId = structure?.structureId;

  const blockOrdered = !(structure?.structures ?? structure?.stage === QUALIFYING);

  const { byesCount, placedByes, relevantMatchUps } = getByesData({
    provisionalPositioning,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });
  const byesToPlace = byesCount - (placedByes || 0);
  if (byesToPlace <= 0) return { ...SUCCESS };

  // LUCKY_DRAW: BYE positions are simply the unfilled first-round draw positions
  if (isLuckyBasedDraw(drawDefinition.drawType)) {
    const firstRoundPositions = (relevantMatchUps || []).flatMap((m) => m.drawPositions || []).filter(Boolean);
    const filledPositions = new Set(
      structure?.positionAssignments?.filter((a) => a.participantId).map((a) => a.drawPosition) || [],
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
  });

  const isOdd = (x) => x % 2;
  // method determines whether candidate c is paired to elements in an array
  const isNotPaired = (arr, c) => (arr || []).every((a) => (isOdd(a) ? c !== a + 1 : c !== a - 1));

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
    byePositions = shuffleArray(byePositions);
    if (getDevContext({ ignoreSeededByes })) console.log({ byePositions });
  }

  // then take only the number of required byes
  const byeDrawPositions = byePositions.slice(0, byesToPlace);

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
