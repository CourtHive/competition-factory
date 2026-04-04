import { getStructureDrawPositionProfiles } from '../structure/getStructureDrawPositionProfiles';
import { getRoundMatchUps } from '../matchUps/getRoundMatchUps';
import { getPositionAssignments } from '../drawDefinition/positionsGetter';
import { getStructureGroups } from '../structure/getStructureGroups';
import { getStructureLinks } from '../drawDefinition/linkGetter';
import { stageOrder } from '@Constants/drawDefinitionConstants';
import { ensureInt } from '@Tools/ensureInt';

import { SUCCESS } from '@Constants/resultConstants';
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

type DrawsAnalysis = {
  positionsNoOutcomes: string[];
  canBePruned: string[];
  matchPlay: string[];
  inactive: string[];
  drawAnalysis: any;
};

export function analyzeDraws({ tournamentRecord }): {
  error?: ErrorType;
  drawsAnalysis?: any;
  success?: boolean;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const drawsAnalysis: DrawsAnalysis = {
    positionsNoOutcomes: [], // all positions assigned and no outcomes
    canBePruned: [], // partially assigned positions with outcomes => drawSizes can be reduced
    matchPlay: [], // only first round has active matchUps; some unassigned positions
    inactive: [],

    drawAnalysis: {},
  };

  const eventsMap = {};

  const eventDraws = tournamentRecord.events
    ?.flatMap((event: any) => {
      const eventId = event.eventId;
      eventsMap[eventId] = event;
      return (event?.drawDefinitions ?? []).map((drawDefinition: any) => ({
        drawDefinition,
        eventId,
      }));
    })
    .filter(Boolean);

  eventDraws.forEach(({ drawDefinition, eventId }) => {
    let positionsAssignedCount = 0;
    let matchUpsWithWinningSideCount = 0;
    let matchUpsNoOutcomeCount = 0;
    const { allStructuresLinked } = getStructureGroups({ drawDefinition });

    const event = eventsMap[eventId];
    const structures = drawDefinition?.structures ?? [];
    const structuresData = structures.map((structure) => {
      const { stage, stageSequence, structureId } = structure;
      const orderNumber = stageOrder[stage];
      const { inContextStructureMatchUps } = getStructureDrawPositionProfiles({
        drawDefinition,
        structureId,
        structure,
        event,
      });
      const matchUpsWithWinningSide = inContextStructureMatchUps?.filter(({ winningSide }) => winningSide);

      const winningSideCount = matchUpsWithWinningSide.filter(Boolean).length || 0;

      matchUpsWithWinningSideCount += winningSideCount;
      matchUpsNoOutcomeCount += inContextStructureMatchUps.length - matchUpsWithWinningSideCount;

      const maxWinningSideFirstRoundPosition = Math.max(
        matchUpsWithWinningSide
          .filter(({ roundNumber }) => roundNumber === 1)
          .map(({ roundPosition }) => roundPosition),
      );

      const { positionAssignments } = getPositionAssignments({ structure });
      const positionsAssigned = positionAssignments?.filter(({ participantId }) => participantId);
      positionsAssignedCount += positionsAssigned?.length ?? 0;

      const unassignedPositionsCount = (positionAssignments?.length ?? 0) - (positionsAssigned?.length ?? 0);

      const { roundMatchUps, roundProfile, roundNumbers, maxMatchUpsCount } = getRoundMatchUps({
        matchUps: inContextStructureMatchUps,
      });

      const activeRounds =
        roundProfile &&
        Object.keys(roundProfile)
          .filter((roundNumber) => !roundProfile[roundNumber].inactiveRound)
          .map((roundNumber) => Number.parseInt(roundNumber));
      const inactiveRounds =
        roundProfile &&
        Object.keys(roundProfile)
          .filter((roundNumber) => roundProfile[roundNumber].inactiveRound)
          .map((roundNumber) => Number.parseInt(roundNumber));
      const inactiveStructure = roundProfile && Object.values(roundProfile).every((profile) => profile.inactiveRound);

      return {
        positionsAssignedCount: positionsAssigned?.length ?? 0,
        maxWinningSideFirstRoundPosition,
        unassignedPositionsCount,
        inactiveStructure,
        maxMatchUpsCount,
        inactiveRounds,
        roundMatchUps,
        activeRounds,
        roundNumbers,
        roundProfile,
        structureId,

        stageSequence,
        orderNumber,
        stage,
      };
    });

    const mainStructure = structuresData.find((data) => data.orderNumber === 2 && data.stageSequence === 1);

    const activeStructuresCount = structuresData.filter(({ inactiveStructure }) => !inactiveStructure).length;

    const { links } = getStructureLinks({
      structureId: mainStructure.structureId,
      drawDefinition,
    });

    const isMatchPlay =
      ensureInt(mainStructure.activeRounds[0]) === 1 &&
      mainStructure.activeRounds.length === 1 &&
      activeStructuresCount === 1;

    const inactiveDraw = structuresData?.every(({ inactiveStructure }) => inactiveStructure);

    const canBePruned =
      !links.length &&
      mainStructure.activeRounds.length &&
      (mainStructure.roundProfile[1].inactiveCount || mainStructure.inactiveRounds.length);

    const drawId = drawDefinition.drawId;

    if (positionsAssignedCount && !matchUpsWithWinningSideCount) drawsAnalysis.positionsNoOutcomes.push(drawId);
    if (inactiveDraw) drawsAnalysis.inactive.push(drawId);
    if (isMatchPlay) drawsAnalysis.matchPlay.push(drawId);
    if (canBePruned) drawsAnalysis.canBePruned.push(drawId);

    const drawAnalysis = {
      matchUpsWithWinningSideCount,
      matchUpsNoOutcomeCount,
      positionsAssignedCount,
      allStructuresLinked,
      structuresData,
      inactiveDraw,
      isMatchPlay,
      drawId,
    };

    drawsAnalysis.drawAnalysis[drawId] = drawAnalysis;
  });

  return { ...SUCCESS, drawsAnalysis };
}
