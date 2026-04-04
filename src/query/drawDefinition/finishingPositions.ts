import { getParticipantIdMatchUps } from './participantIdMatchUps';

import { getDevContext } from '@Global/state/globalState';

// constants and types
import { DrawDefinition, Event, Tournament, PositionAssignment } from '@Types/tournamentTypes';
import { getPositionAssignments } from '@Query/structure/getPositionAssignments';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';

// Extend MatchUp to include optional containerStructureId
import { CONTAINER, MAIN, PLAY_OFF } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { getEventData } from '@Query/event/getEventData';
import { HydratedMatchUp } from '@Types/hydrated';

type GetParticipantIdFinishingPositionsArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  byeAdvancements?: boolean;
  event?: Event;
};
export function getParticipantIdFinishingPositions({
  byeAdvancements = false,
  tournamentRecord,
  drawDefinition,
  event,
}: GetParticipantIdFinishingPositionsArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { participantIds, participantIdMatchUps } = getParticipantIdMatchUps({
    tournamentParticipants: tournamentRecord?.participants,
    drawDefinition,
  });

  const hasContainerMatchUps = Object.values(participantIdMatchUps).some((value) =>
    (value as HydratedMatchUp[]).some((matchUp) => matchUp.containerStructureId),
  );
  const eventInfo: any = hasContainerMatchUps && getEventData({ tournamentRecord, event });
  // drawDataStructures contains detail on participantResults which include groupOrder and
  // provisionalOrder which can be used to determine finishing positions for container matchUps
  const drawDataStructures = eventInfo?.eventData?.drawsData?.find(
    (draw) => draw.drawId === drawDefinition.drawId,
  )?.structures;

  // containedStructures is necessary to determine bracket sizes which is necessary to determine finishing positions for container matchUps
  const mainStructure = drawDefinition?.structures?.find(
    (structure) => structure.stage === MAIN && structure.stageSequence === 1,
  );
  const containedStructures: any = mainStructure?.structureType === CONTAINER && mainStructure.structures;

  // positionAssignments contains the participantResults which include groupOrder and provisionalOrder
  // which can be used to determine finishing positions for container matchUps
  const positionAssignments: PositionAssignment[] | undefined = hasContainerMatchUps
    ? getPositionAssignments({ tournamentRecord, drawDefinition, structureId: mainStructure?.structureId })
        ?.positionAssignments
    : undefined;
  const drawPositionsCount: any = positionAssignments?.length || 0;

  const participantIdFinishingPositions =
    participantIds?.map((participantId) => {
      const matchUps = participantIdMatchUps[participantId];
      const relevantMatchUps = matchUps.filter(
        (matchUp) => [COMPLETED, BYE].includes(matchUp.matchUpStatus) || matchUp.winningSide,
      );
      const finishingPositionRanges = relevantMatchUps.map((matchUp) => {
        const isByeMatchUp = matchUp.sides.find((side) => side.bye);
        const participantSide = matchUp.sides.find((side) => side.participantId === participantId).sideNumber;
        const isContainerMatchUp = matchUp.containerStructureId;
        if (isContainerMatchUp) {
          const containedFinishingPosition = containerFinishingPosition({
            containedStructures,
            drawPositionsCount,
            drawDataStructures,
            drawDefinition,
            participantId,
            matchUp,
          });
          if (containedFinishingPosition) return containedFinishingPosition;
        }

        const advancingSide = matchUp.winningSide || (byeAdvancements && isByeMatchUp && participantSide);

        return advancingSide === participantSide
          ? matchUp.finishingPositionRange.winner
          : matchUp.finishingPositionRange.loser;
      });

      const diff = (range) => Math.abs(range[0] - range[1]);
      const finishingPositionRange = finishingPositionRanges.reduce((finishingPositionRange, range) => {
        if (!finishingPositionRange) return range;
        return diff(finishingPositionRange) < diff(range) ? finishingPositionRange : range;
      }, undefined);

      return {
        [participantId]: {
          finishingPositionRanges,
          finishingPositionRange,
          relevantMatchUps,
        },
      };
    }) ?? [];

  return Object.assign({}, ...participantIdFinishingPositions);
}

function containerFinishingPosition({
  containedStructures,
  drawPositionsCount,
  drawDataStructures,
  drawDefinition,
  participantId,
  matchUp,
}) {
  const containedStructure = containedStructures?.find((structure) => structure.structureId === matchUp.structureId);
  const bracketSize = containedStructure?.positionAssignments?.length;
  const participantResult = drawDataStructures
    .find((structure) => structure.structureId === matchUp.containerStructureId)
    ?.participantResults?.find((result) => result.participantId === participantId)?.participantResult;
  const { ties, groupOrder, provisionalOrder } = participantResult ?? {};
  const bracketsCount = containedStructures?.length;

  const playoffStructure = drawDefinition.structure?.find((structure) => structure.stage === PLAY_OFF);

  if (getDevContext())
    console.log({
      drawPositionsCount,
      provisionalOrder,
      bracketsCount,
      bracketSize,
      groupOrder,
      ties,
    });

  if (drawPositionsCount === bracketSize && groupOrder) {
    // if there is only one bracket, then the groupOrder is the finishing position
    return [groupOrder, groupOrder];
  } else if (bracketsCount > 1 && groupOrder && !playoffStructure) {
    // if there are multiple brackets and the participant has a groupOrder,
    // and there is no playoff structure, then we can determine finishing position by multiplying the bracket size by the number of brackets
    return [1, bracketsCount];
  } else if (bracketsCount > 1 && groupOrder && playoffStructure) {
    // if there are multiple brackets and the participant has a groupOrder,
    // we need to understand how many players from each bracket advance to the playoff structure in order to determine finishing position
    const advancingPositions = drawDefinition.links?.find(
      (link) => link.source.structureId === matchUp.containerStructureId,
    )?.source?.finishingPositions;
    const totalAdvancingPositions = advancingPositions.length * bracketsCount;
    if (groupOrder in advancingPositions) {
      return [1, totalAdvancingPositions];
    } else {
      const finishingOffset = (bracketSize - groupOrder) * bracketsCount;
      return [totalAdvancingPositions + 1, drawPositionsCount - finishingOffset];
    }
  }

  return undefined;
}
