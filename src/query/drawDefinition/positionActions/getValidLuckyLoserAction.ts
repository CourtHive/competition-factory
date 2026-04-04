import { getAllStructureMatchUps } from '../../matchUps/getAllStructureMatchUps';
import { getInitialRoundNumber } from '../../matchUps/getInitialRoundNumber';
import { getStructureMatchUps } from '../../structure/getStructureMatchUps';
import { getParticipantId } from '@Functions/global/extractors';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, Participant, PositionAssignment, Structure } from '@Types/tournamentTypes';
import { LUCKY_PARTICIPANT, LUCKY_PARTICIPANT_METHOD } from '@Constants/positionActionConstants';
import { ROUND_OUTCOME } from '@Constants/drawDefinitionConstants';
import { HydratedParticipant } from '@Types/hydrated';
import { TEAM } from '@Constants/eventConstants';

type GetValidLuckLoserActionArgs = {
  tournamentParticipants?: HydratedParticipant[];
  positionAssignments: PositionAssignment[];
  sourceStructuresComplete?: boolean;
  possiblyDisablingAction?: boolean;
  isWinRatioFedStructure?: boolean;
  activeDrawPositions: number[];
  drawDefinition: DrawDefinition;
  structure: Structure;
  drawPosition: number;
  structureId: string;
  drawId: string;
  event?: Event;
};

export function getValidLuckyLosersAction({
  tournamentParticipants = [],
  sourceStructuresComplete,
  possiblyDisablingAction,
  isWinRatioFedStructure,
  activeDrawPositions,
  positionAssignments,
  drawDefinition,
  drawPosition,
  structureId,
  structure,
  drawId,
  event,
}: GetValidLuckLoserActionArgs) {
  if (
    activeDrawPositions.includes(drawPosition) ||
    // can't be a lucky loser if still have matches to play in a round robin structure!!
    (isWinRatioFedStructure && !sourceStructuresComplete)
  ) {
    return {};
  }

  /*
  Available Lucky Losers are those participants who are assigned drawPositions
  in source draw structures and have already lost

  If links are by ROUND_OUTCOME, and...
  If there is only one source structure and only one target structure, then no round restrictions;
  otherwise restrict the aviailable lucky losers by the source round in the source structure
  */

  const { sourceStructureIds, targetStructureIds } =
    drawDefinition.links?.reduce(
      (ids: any, link) => {
        const sourceStructureId = link.source?.structureId;
        const targetStructureId = link.target?.structureId;
        if (!ids.sourceStructureIds.includes(sourceStructureId)) ids.sourceStructureIds.push(sourceStructureId);
        if (!ids.targetStructureIds.includes(targetStructureId)) ids.targetStructureIds.push(targetStructureId);
        return ids;
      },
      { sourceStructureIds: [], targetStructureIds: [] },
    ) ?? {};

  const availableLuckyLoserParticipantIds: string[] = [];

  const relevantLinks =
    drawDefinition.links?.filter((link) => link.target?.structureId === structure.structureId) ?? [];

  for (const relevantLink of relevantLinks) {
    const sourceStructureId = relevantLink?.source?.structureId;

    const { structure: sourceStructure } = findStructure({
      structureId: sourceStructureId,
      drawDefinition,
    });

    const restrictBySourceRound =
      sourceStructure?.finishingPosition === ROUND_OUTCOME &&
      (sourceStructureIds?.length !== 1 || targetStructureIds?.length !== 1);

    const matchUpFilters: any = {};
    if (restrictBySourceRound) {
      const { matchUps } = getAllStructureMatchUps({
        drawDefinition,
        structure,
        event,
      });
      const { initialRoundNumber } = getInitialRoundNumber({
        drawPosition,
        matchUps,
      });
      const relevantLink = drawDefinition.links?.find(
        (link) => link.target?.structureId === structure?.structureId && link.target.roundNumber === initialRoundNumber,
      );
      const sourceRoundNumber = relevantLink?.source?.roundNumber;
      matchUpFilters.roundNumbers = [sourceRoundNumber];
    }

    const { completedMatchUps } = getStructureMatchUps({
      structureId: sourceStructureId,
      inContext: true,
      matchUpFilters,
      drawDefinition,
    });

    const assignedParticipantIds = positionAssignments.map((assignment) => assignment.participantId).filter(Boolean);

    const availableParticipantIds = completedMatchUps
      ?.filter(({ matchUpType, winningSide }) => winningSide && (event?.eventType !== TEAM || matchUpType === TEAM))
      .map(({ winningSide, sides }) => winningSide && sides?.[1 - (winningSide - 1)])
      .map(getParticipantId)
      .filter((participantId) => participantId && !assignedParticipantIds.includes(participantId));

    availableParticipantIds?.forEach((participantId) => {
      // ensure if 'restrictBySourceRound' is false and there are multiple links that participants aren't added multiple times
      if (!availableLuckyLoserParticipantIds.includes(participantId))
        availableLuckyLoserParticipantIds.push(participantId);
    });
  }

  const availableLuckyLosers = tournamentParticipants?.filter((participant: Participant) =>
    availableLuckyLoserParticipantIds?.includes(participant.participantId),
  );

  availableLuckyLosers?.forEach((luckyLoser: any) => {
    const entry = (drawDefinition.entries ?? []).find((entry) => entry.participantId === luckyLoser.participantId);
    luckyLoser.entryPosition = entry?.entryPosition;
  });

  if (availableLuckyLoserParticipantIds?.length) {
    const validLuckyLosersAction = {
      type: LUCKY_PARTICIPANT,
      method: LUCKY_PARTICIPANT_METHOD,
      availableLuckyLosers,
      availableLuckyLoserParticipantIds,
      willDisableLinks: possiblyDisablingAction,
      payload: { drawId, structureId, drawPosition },
    };
    return { validLuckyLosersAction };
  }

  return {};
}
