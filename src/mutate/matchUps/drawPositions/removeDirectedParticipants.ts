import { includesMatchUpStatuses } from '@Mutate/drawDefinitions/matchUpGovernor/includesMatchUpStatuses';
import { removeSubsequentRoundsParticipant } from './removeSubsequentRoundsParticipant';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { clearDrawPosition } from './positionClear';
import { instanceCount } from '@Tools/arrays';

// constants and types
import { ErrorType, MISSING_DRAW_POSITIONS, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Event, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { MatchUpsMap } from '@Types/factoryTypes';

export function removeDirectedParticipants(params): {
  tieMatchUpResult?: any;
  error?: ErrorType;
  success?: boolean;
} {
  const {
    dualWinningSideChange,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpStatus,
    matchUpsMap,
    dualMatchUp,
    targetData,
    matchUpId,
    structure,
    event,
  } = params;

  const isCollectionMatchUp = Boolean(params.matchUp.collectionId);
  const isAdHocMatchUp = isAdHoc({ structure });

  // targetData will have team matchUp when params.matchUp is a collectionMatchUp
  const { drawPositions, winningSide } = targetData.matchUp ?? {};
  if (!isAdHocMatchUp && !drawPositions) {
    return { error: MISSING_DRAW_POSITIONS };
  }

  const {
    targetLinks: { loserTargetLink, winnerTargetLink, byeTargetLink },
    targetMatchUps: { loserMatchUp, winnerMatchUp, byeMatchUp },
  } = targetData;

  const result = modifyMatchUpScore({
    ...params,
    matchUpStatus: matchUpStatus || TO_BE_PLAYED,
    removeWinningSide: true,
  });
  if (result.error) return result;

  let tieMatchUpResult;
  if (isCollectionMatchUp) {
    const { matchUpTieId, matchUpsMap } = params;
    tieMatchUpResult = updateTieMatchUpScore({
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (!dualWinningSideChange && !tieMatchUpResult.removeWinningSide) return { ...SUCCESS };
  }

  if (isAdHocMatchUp) return { ...SUCCESS };

  const { matchUps: sourceMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    structure,
  });

  const { positionAssignments } = structureAssignedDrawPositions({ structure });

  const winningIndex = winningSide - 1;
  const losingIndex = 1 - winningIndex;
  const winningDrawPosition = drawPositions[winningIndex];
  const loserDrawPosition = drawPositions[losingIndex];

  // use reduce for single pass resolution of both
  const { winnerParticipantId, loserParticipantId } =
    positionAssignments?.reduce(
      (assignments: any, assignment) => {
        if (assignment.drawPosition === loserDrawPosition) assignments.loserParticipantId = assignment.participantId;
        if (assignment.drawPosition === winningDrawPosition) assignments.winnerParticipantId = assignment.participantId;
        return assignments;
      },
      { winnerParticipantId: undefined, loserParticipantId: undefined },
    ) ?? {};

  const drawPositionMatchUps = sourceMatchUps.filter((matchUp) => matchUp.drawPositions?.includes(loserDrawPosition));

  if (winnerMatchUp) {
    removeDirectedWinner({
      sourceMatchUpStatus: matchUpStatus,
      sourceMatchUpId: matchUpId,
      inContextDrawMatchUps,
      winningDrawPosition,
      winnerParticipantId,
      tournamentRecord,
      winnerTargetLink,
      drawDefinition,
      winnerMatchUp,
      dualMatchUp,
      matchUpsMap,
    });
  }

  if (loserMatchUp) {
    const { winnerHadMatchUpStatus: winnerHadBye } = includesMatchUpStatuses({
      drawPositionMatchUps,
      loserDrawPosition,
      sourceMatchUps,
    });

    const loserLinkCondition = loserTargetLink.linkCondition;
    const firstMatchUpLoss = loserLinkCondition === FIRST_MATCHUP;

    if (winnerHadBye && firstMatchUpLoss) {
      // The fed drawPosition is always the lowest number
      const drawPosition = Math.min(...loserMatchUp.drawPositions);
      removeDirectedBye({
        targetLink: loserTargetLink,
        inContextDrawMatchUps,
        drawDefinition,
        drawPosition,
        matchUpsMap,
        event,
      });
    }

    const removeLoserResult = removeDirectedLoser({
      sourceMatchUpStatus: matchUpStatus,
      sourceMatchUpId: matchUpId,
      loserParticipantId,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
      dualMatchUp,
      matchUpsMap,
      event,
    });
    if (removeLoserResult.error) return removeLoserResult;
  }

  if (byeMatchUp) {
    // check whether byeMatchUp includes an active drawPosition
    const drawPosition = Math.min(...byeMatchUp.drawPositions);
    removeDirectedBye({
      sourceMatchUpId: matchUpId,
      targetLink: byeTargetLink,
      inContextDrawMatchUps,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      event,
    });
  }

  const annotate = tieMatchUpResult && { tieMatchUpResult };
  return { ...SUCCESS, ...annotate };
}
type RemvoveDirectedWinnerArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  winnerMatchUp: HydratedMatchUp;
  dualMatchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  winnerParticipantId?: string;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: string;
  winningDrawPosition: number;
  winnerTargetLink?: DrawLink;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  event?: Event;
};
export function removeDirectedWinner({
  inContextDrawMatchUps,
  winningDrawPosition,
  sourceMatchUpStatus,
  winnerParticipantId,
  tournamentRecord,
  winnerTargetLink,
  sourceMatchUpId,
  drawDefinition,
  winnerMatchUp,
  matchUpsMap,
  dualMatchUp,
  event,
}: RemvoveDirectedWinnerArgs) {
  const { structureId, roundNumber } = winnerMatchUp;
  const stack = 'removeDirectedWinner';

  if (winnerTargetLink) {
    const structureId = winnerTargetLink.target.structureId;
    const { structure } = findStructure({ drawDefinition, structureId });
    if (!structure) return { error: STRUCTURE_NOT_FOUND };
    const { positionAssignments } = structureAssignedDrawPositions({
      structure,
    });

    // remove participant from seedAssignments
    structure.seedAssignments = (structure.seedAssignments ?? []).filter(
      (assignment) => assignment.participantId !== winnerParticipantId,
    );

    const relevantAssignment = positionAssignments?.find(
      (assignment) => assignment.participantId === winnerParticipantId,
    );
    const winnerDrawPosition = relevantAssignment?.drawPosition;

    const { matchUps } = getAllStructureMatchUps({
      drawDefinition,
      structure,
      event,
    });
    const allDrawPositionInstances = matchUps
      .map((matchUp) => matchUp.drawPositions)
      .flat(Infinity)
      .filter(Boolean);
    const drawPositionInstanceCount = instanceCount(allDrawPositionInstances);
    const winnerDrawPositionInstances = winnerDrawPosition ? drawPositionInstanceCount[winnerDrawPosition] : undefined;

    if (winnerDrawPositionInstances === 1) {
      // only remove position assignment if it has a single instance...
      // if there are multiple instances then a participant has been fed back into a draw
      positionAssignments?.forEach((assignment) => {
        if (assignment.participantId === winnerParticipantId) {
          delete assignment.participantId;
        }
      });
    } else {
      const drawPositionMatchUps = matchUps.filter(({ drawPositions }) => drawPositions.includes(winnerDrawPosition));
      console.log('not removing from position assignments since instances > 1', {
        drawPositionMatchUps,
        winnerTargetLink,
      });
    }

    const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === winnerMatchUp.matchUpId);

    targetMatchUp &&
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        matchUp: targetMatchUp,
        context: stack,
        drawDefinition,
      });
  }

  // Remove participant's drawPosition from current and subsequent round matchUps
  roundNumber &&
    removeSubsequentRoundsParticipant({
      targetDrawPosition: winningDrawPosition,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      dualMatchUp,
      matchUpsMap,
      roundNumber,
      structureId,
    });

  return { ...SUCCESS };
}

function removeDirectedLoser({
  sourceMatchUpStatus,
  loserParticipantId,
  tournamentRecord,
  loserTargetLink,
  sourceMatchUpId,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  dualMatchUp,
  event,
}): { error?: ErrorType; success?: boolean } {
  const stack = 'removeDirectedLoser';
  const structureId = loserTargetLink.target.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const relevantDrawPosition = positionAssignments?.find(
    (assignment) => assignment.participantId === loserParticipantId,
  )?.drawPosition;
  positionAssignments?.forEach((assignment) => {
    if (assignment.participantId === loserParticipantId) {
      delete assignment.participantId;
    }
  });

  if (sourceMatchUpId && sourceMatchUpStatus) {
    //It could be that the loser match up was already a double walkover with one propagated
    //exit with a player and the other participant as a produced exit from a parent double WO.
    //We then want to remove the specific WO reason for the participant as the participant
    //has been removed from the draw positions and this is now a straight double WO.
    //In case the loser matchup was not a double WO we jsut remove the status codes.
    const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);
    targetMatchUp.matchUpStatusCodes = sourceMatchUpStatus === DOUBLE_WALKOVER ? ['WO', 'WO'] : [];
  }

  // remove participant from seedAssignments
  structure.seedAssignments = (structure.seedAssignments ?? []).filter(
    (assignment) => assignment.participantId !== loserParticipantId,
  );

  if (dualMatchUp) {
    // remove propagated lineUp
    const drawPositionSideIndex = loserMatchUp?.sides.reduce(
      (sideIndex, side, i) => (side.drawPosition === relevantDrawPosition ? i : sideIndex),
      undefined,
    );
    const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);
    const targetSide = targetMatchUp?.sides?.[drawPositionSideIndex];

    if (targetSide) {
      delete targetSide.lineUp;

      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        matchUp: targetMatchUp,
        context: stack,
        drawDefinition,
      });
    }
  }

  return { ...SUCCESS };
}

type RemoveDirectedByeArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  drawPosition: number;
  targetLink: DrawLink;
  event?: Event;
};
export function removeDirectedBye({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  targetLink,
  event,
}: RemoveDirectedByeArgs) {
  const structureId = targetLink.target.structureId;
  const stack = 'removeDirectedBye';

  pushGlobalLog({
    color: 'brightyellow',
    method: stack,
    drawPosition,
  });

  const result = clearDrawPosition({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    matchUpsMap,
    structureId,
    event,
  });

  return decorateResult({ result, stack });
}
