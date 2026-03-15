import { getPairedPreviousMatchUpIsDoubleExit } from '@Query/matchUps/getPairedPreviousMatchUpIsDoubleExit';
import { getUpdatedDrawPositions } from '@Mutate/drawDefinitions/matchUpGovernor/getUpdatedDrawPositions';
import { updateMatchUpStatusCodes } from '@Mutate/drawDefinitions/matchUpGovernor/matchUpStatusCodes';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { updateSideLineUp } from '@Mutate/matchUps/lineUps/updateSideLineUp';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { assignDrawPositionBye } from './assignDrawPositionBye';
import { isExit } from '@Validators/isExit';
import { overlap } from '@Tools/arrays';

// constants and types
import { DRAW_POSITION_ASSIGNED, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { MatchUpsMap } from '@Types/factoryTypes';
import { TEAM } from '@Constants/matchUpTypes';
import {
  BYE,
  COMPLETED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
} from '@Constants/matchUpStatusConstants';

type AssignMatchUpDrawPositionArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: string;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  matchUpStatus?: string;
  drawPosition: number;
  matchUpId: string;
  event?: Event;
};
export function assignMatchUpDrawPosition({
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  tournamentRecord,
  sourceMatchUpId,
  drawDefinition,
  matchUpStatus,
  drawPosition,
  matchUpsMap,
  matchUpId,
  event,
}: AssignMatchUpDrawPositionArgs) {
  const stack = 'assignMatchUpDrawPosition';

  matchUpsMap ??= getMatchUpsMap({ drawDefinition });

  if (!inContextDrawMatchUps) {
    inContextDrawMatchUps =
      getAllDrawMatchUps({
        inContext: true,
        drawDefinition,
        matchUpsMap,
      }).matchUps ?? [];
  }

  const inContextMatchUp = inContextDrawMatchUps.find((m) => m.matchUpId === matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const structure = drawDefinition?.structures?.find((structure) => structure.structureId === structureId);

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const matchUp = matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  const drawPositions: number[] = matchUp?.drawPositions ?? [];
  const { positionAdded, positionAssigned, updatedDrawPositions } = getUpdatedDrawPositions({
    drawPositions,
    drawPosition,
  });

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structure,
  });

  const matchUpAssignments = positionAssignments?.filter((assignment) =>
    updatedDrawPositions.includes(assignment.drawPosition),
  );
  const isByeMatchUp = matchUpAssignments?.find(({ bye }) => bye);
  const isDoubleExitExit =
    matchUp?.matchUpStatus && isExit(matchUp.matchUpStatus) && updatedDrawPositions.filter(Boolean).length < 2;

  matchUpStatus =
    (isByeMatchUp && BYE) ||
    matchUpStatus ||
    (isDoubleExitExit && matchUp.matchUpStatus) ||
    (matchUp?.matchUpStatus &&
      [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUp.matchUpStatus) &&
      matchUp.matchUpStatus) ||
    TO_BE_PLAYED;

  //are we going to a match already marked as a WO becuase it was propagated from the main draw?
  const isPropagatedExit = !!(isExit(matchUp?.matchUpStatus) && matchUp?.winningSide);

  if (matchUp && positionAdded) {
    // necessary to update inContextDrawMatchUps
    inContextDrawMatchUps =
      getAllDrawMatchUps({
        inContext: true,
        drawDefinition,
        matchUpsMap,
      }).matchUps ?? [];
    const exitWinningSide =
      (isDoubleExitExit &&
        getExitWinningSide({
          inContextDrawMatchUps,
          drawPosition,
          matchUpId,
        })) ||
      //if the match is already marked as a WO with a winning side
      //we keep the winning side
      (isPropagatedExit && matchUp.winningSide) ||
      undefined;

    if (matchUp?.matchUpStatusCodes) {
      updateMatchUpStatusCodes({
        inContextDrawMatchUps,
        sourceMatchUpStatus,
        sourceMatchUpId,
        matchUpsMap,
        matchUp,
      });
    }

    // only in the case of "Double Exit" produced "Exit" can a winningSide be assigned at the same time as a position
    Object.assign(matchUp, {
      drawPositions: updatedDrawPositions,
      winningSide: exitWinningSide,
      //we keep the current status if it is already marked as WO
      matchUpStatus: isPropagatedExit ? matchUp?.matchUpStatus : matchUpStatus,
    });

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: inContextMatchUp?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
    });
  }

  const targetData = positionTargets({
    inContextDrawMatchUps,
    inContextMatchUp,
    drawDefinition,
    matchUpId,
  });
  const {
    targetMatchUps: { winnerMatchUp, loserMatchUp, loserTargetDrawPosition },
    targetLinks: { loserTargetLink },
  } = targetData;

  const structureMatchUps = getMappedStructureMatchUps({
    structureId: structure.structureId,
    matchUpsMap,
  });

  // In lucky draws, all round-to-round advancement is handled by luckyDrawAdvancement
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);

  if (positionAssigned && isByeMatchUp && !isLuckyDraw) {
    if (winnerMatchUp) {
      if ([BYE, DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus)) {
        const result = assignMatchUpDrawPosition({
          matchUpId: winnerMatchUp.matchUpId,
          inContextDrawMatchUps,
          tournamentRecord,
          drawDefinition,
          drawPosition,
          matchUpsMap,
        });
        if (result.error) return result;
      } else {
        const { structureId } = winnerMatchUp;
        if (structureId !== structure.structureId) {
          console.log('winnerMatchUp in different structure... participant is in different targetDrawPosition');
        }
      }
    }
  }
  //we want to automatically progress the winner if the match was already marked as a walkover
  else if (positionAssigned && isPropagatedExit) {
    if (winnerMatchUp) {
      const result = assignMatchUpDrawPosition({
        matchUpId: winnerMatchUp.matchUpId,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        drawPosition,
        matchUpsMap,
      });
      if (result.error) return result;
    }
  } else if (winnerMatchUp && inContextMatchUp && !inContextMatchUp.feedRound) {
    const { pairedPreviousMatchUpIsDoubleExit } = getPairedPreviousMatchUpIsDoubleExit({
      targetMatchUp: matchUp,
      drawPosition,
      matchUpsMap,
      structure,
    });

    if (pairedPreviousMatchUpIsDoubleExit) {
      const result = assignMatchUpDrawPosition({
        matchUpId: winnerMatchUp.matchUpId,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        drawPosition,
        matchUpsMap,
      });
      if (result.error) return result;
    }
  }

  // if { matchUpType: TEAM } then also assign the default lineUp to the appopriate side
  if (matchUp?.matchUpType === TEAM) {
    const inContextTargetMatchUp = inContextDrawMatchUps?.find(({ matchUpId }) => matchUpId === matchUp.matchUpId);
    const sides: any[] = inContextTargetMatchUp?.sides ?? [];
    const drawPositionSideIndex = sides.reduce(
      (index, side, i) => (side.drawPosition === drawPosition ? i : index),
      undefined,
    );
    const teamParticipantId = positionAssignments?.find(
      (assignment) => assignment.drawPosition === drawPosition,
    )?.participantId;

    if (teamParticipantId && drawPositionSideIndex !== undefined) {
      updateSideLineUp({
        inContextTargetMatchUp,
        drawPositionSideIndex,
        teamParticipantId,
        tournamentRecord,
        drawDefinition,
        matchUp,
      });
    }
  }

  // if FIRST_MATCH_LOSER_CONSOLATION, check whether a BYE should be placed in consolation feed
  if (
    loserTargetLink?.linkCondition === FIRST_MATCHUP &&
    updatedDrawPositions.filter(Boolean).length === 2 &&
    !isByeMatchUp
  ) {
    const firstRoundMatchUps = structureMatchUps.filter(
      ({ drawPositions, roundNumber }) => roundNumber === 1 && overlap(drawPositions, updatedDrawPositions),
    );
    const byePropagation = firstRoundMatchUps.every(({ matchUpStatus }) =>
      [COMPLETED, RETIRED].includes(matchUpStatus),
    );
    if (byePropagation && loserMatchUp) {
      const { structureId } = loserMatchUp;
      const result = assignDrawPositionBye({
        drawPosition: loserTargetDrawPosition,
        tournamentRecord,
        drawDefinition,
        structureId,
        matchUpsMap,
        event,
      });

      if (result.error) return result;
    }
  }

  if (positionAssigned) {
    return { ...SUCCESS };
  } else {
    return decorateResult({
      result: { error: DRAW_POSITION_ASSIGNED },
      context: { drawPosition },
      stack,
    });
  }
}
