import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { drawPositionFilled } from './drawPositionFilled';
import { findStructure } from '@Acquire/findStructure';
import { numericSort } from '@Tools/sorting';
import { isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { MatchUpsMap } from '@Types/factoryTypes';
import {
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  LUCKY_DRAW_BYE_LIMIT,
  MISSING_DRAW_DEFINITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/*
  assignDrawPositionBye

  supporting functions:
  - drawPositionFilled
  - setMatchUpStatusBYE
  - assignRoundRobinBYE
  - advanceDrawPosition

  PSEUDOCODE:
  *. Requires allDrawMatchUps inContext
  *. Requires structureMatchUps

  => assignDrawPositionBye
  1. Modifies structure positionAssignments to assign BYE to position
    - if structure is part of ROUND ROBIN then return { ...SUCCESS }
  2. Finds the furthest advancement of the drawPosition to determine the matchUp where BYE-advancement needs to occur
  3. Set the matchUpStatus to BYE
  4. Check whether there is a position to Advance

  If so...
  => advancePosition
  5a. Use links to find winnerMatchUp and loserMatchUp

  6. If winnerMatchUp is part of same structure...
  6a. Add drawPosition to target matchUp 
  6b. Check for further advancement and if so, go back to step #5
  6b. If no further positions to advance check for FMLC Consolation BYE assignment

  7. If loserMatchUp is part of different structure... return to step #1
 */

type AssignDrawPositionByeArgs = {
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  isPositionAction?: boolean;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  drawPosition: number;
  structureId?: string;
  loserMatchUp?: MatchUp;
  event?: Event;
};

export function assignDrawPositionBye({
  provisionalPositioning,
  isPositionAction,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  loserMatchUp,
  matchUpsMap,
  structureId,
  structure,
  event,
}: AssignDrawPositionByeArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (!structureId) ({ structureId } = structure);

  const stack = 'assignDrawPositionBye';
  pushGlobalLog({ method: stack, color: 'cyan', drawPosition });

  matchUpsMap ??= getMatchUpsMap({ drawDefinition });
  const { positionAssignments } = getPositionAssignments({ structure });
  const { activeDrawPositions } = getStructureDrawPositionProfiles({
    drawDefinition,
    structureId,
  });

  const currentAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);

  if (currentAssignment?.bye) {
    return { ...SUCCESS };
  }

  // Lucky draw: at most one BYE allowed in the first round
  if (isLuckyBasedDraw(drawDefinition.drawType)) {
    const existingByes = positionAssignments?.filter((a) => a.bye && a.drawPosition !== drawPosition);
    if (existingByes?.length) {
      return decorateResult({ result: { error: LUCKY_DRAW_BYE_LIMIT }, stack });
    }
  }

  //
  const hasPropagatedStatus = !!(
    loserMatchUp &&
    matchUpsMap.drawMatchUps.some((m) => m.loserMatchUpId === loserMatchUp?.matchUpId && isExit(m.matchUpStatus))
  );
  // ################### Check error conditions ######################
  const drawPositionIsActive = activeDrawPositions?.includes(drawPosition);
  if (drawPositionIsActive && !hasPropagatedStatus) {
    return { error: DRAW_POSITION_ACTIVE };
  }

  let positionAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
  if (!positionAssignment) {
    // Position exists in matchUps but has no positionAssignment entry — add one
    positionAssignment = { drawPosition };
    positionAssignments?.push(positionAssignment);
  }

  const { filled, containsBye, containsParticipant: assignedParticipantId } = drawPositionFilled(positionAssignment);
  if (containsBye) return { ...SUCCESS }; // nothing to be done

  if (filled && !containsBye && !hasPropagatedStatus) {
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      event,
    }).appliedPolicies ?? {};

  // ########## gather reusable data for performance optimization ###########
  const inContextDrawMatchUps =
    getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }).matchUps ?? [];

  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps } = getAllStructureMatchUps({
    provisionalPositioning,
    drawDefinition,
    matchUpFilters,
    matchUpsMap,
    structure,
  });

  // modifies the structure's positionAssignments
  // applies to both ELIMINATION and ROUND_ROBIN structures
  positionAssignments?.forEach((assignment) => {
    if (assignment.drawPosition === drawPosition) {
      assignment.bye = true;
      //let's clear up the participant from the assignment
      //if it was there because of a propagated exit.
      if (hasPropagatedStatus) {
        assignment.participantId = undefined;
      }
    }
  });

  if (structure.structureType === CONTAINER) {
    assignRoundRobinBYE({
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUps,
    });

    modifyPositionAssignmentsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
      structure,
      event,
    });

    return successNotice({
      assignedParticipantId,
      isPositionAction,
      appliedPolicies,
      drawDefinition,
      drawPosition,
      structureId,
      stack,
    });
  }

  // ############ Get furthest advancement of drawPosition ############
  const { roundProfile, roundMatchUps } = getRoundMatchUps({ matchUps });

  // search from final rounds towards first rounds to find furthest advancement
  const roundNumbers =
    roundProfile &&
    Object.keys(roundProfile)
      .map((roundNumber) => Number.parseInt(roundNumber))
      .reverse();
  const roundNumber = roundNumbers?.find((roundNumber) => {
    return roundProfile?.[roundNumber].drawPositions?.includes(drawPosition);
  });

  // matchUp where BYE-advancement needs to occur
  const matchUp = roundNumber
    ? roundMatchUps?.[roundNumber].find(({ drawPositions }) => drawPositions?.includes(drawPosition))
    : undefined;

  matchUp && setMatchUpStatusBYE({ tournamentRecord, drawDefinition, matchUp, event });

  const drawPositionToAdvance = matchUp?.drawPositions?.find((position) => position !== drawPosition);

  if (matchUp && drawPositionToAdvance) {
    const result = advanceDrawPosition({
      sourceDrawPositions: matchUp.drawPositions,
      matchUpId: matchUp.matchUpId,
      inContextDrawMatchUps,
      drawPositionToAdvance,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
    });
    if (result.error) return result;
  }

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  return successNotice({
    assignedParticipantId,
    isPositionAction,
    appliedPolicies,
    drawDefinition,
    drawPosition,
    structureId,
    stack,
  });
}

function successNotice({
  assignedParticipantId,
  isPositionAction,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  stack,
}) {
  if (isPositionAction) {
    const positionAction = {
      removedParticipantId: assignedParticipantId,
      drawPosition,
      structureId,
      name: stack,
    };
    addPositionActionTelemetry({ appliedPolicies, drawDefinition, positionAction });
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

type SetMatchUpStatusByeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  eventId?: string;
  matchUp: MatchUp;
  event?: Event;
};
function setMatchUpStatusBYE({ tournamentRecord, drawDefinition, eventId, matchUp, event }: SetMatchUpStatusByeArgs) {
  Object.assign(matchUp, {
    matchUpStatus: BYE,
    score: undefined,
    winningSide: undefined,
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: eventId ?? event?.eventId,
    context: 'setMatchUpStatusBye',
    drawDefinition,
    matchUp,
  });
}

type AssignRoundRobinByeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  matchUps: MatchUp[];
  event?: Event;
};

function assignRoundRobinBYE({
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUps,
  event,
}: AssignRoundRobinByeArgs) {
  matchUps.forEach((matchUp) => {
    if (matchUp.drawPositions?.includes(drawPosition)) {
      setMatchUpStatusBYE({
        eventId: event?.eventId,
        tournamentRecord,
        drawDefinition,
        matchUp,
      });
    }
  });
}

// Looks to see whether a given matchUp has a winnerMatchup or a loserMatchUp
// and if so advances the appropriate drawPosition into the targetMatchUp
type AdvanceDrawPositionType = {
  inContextDrawMatchUps: HydratedMatchUp[];
  sourceDrawPositions?: number[];
  drawPositionToAdvance: number;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  matchUpId: string;
  event?: Event;
};
export function advanceDrawPosition({
  drawPositionToAdvance,
  inContextDrawMatchUps,
  sourceDrawPositions,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  matchUpId,
  event,
}: AdvanceDrawPositionType) {
  const stack = 'advanceDrawPosition';
  pushGlobalLog({ method: stack, color: 'cyan', drawPositionToAdvance });

  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = getPositionAssignments({
    structure,
  });

  const byeAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  const losingDrawPosition = matchUp?.drawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);
  const losingDrawPosiitonIsBye = losingDrawPosition && byeAssignedDrawPositions?.includes(losingDrawPosition);

  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, winnerMatchUp, loserTargetDrawPosition },
  } = positionTargets({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpId,
  });

  // In lucky draws, all round-to-round advancement is handled by luckyDrawAdvancement
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);

  // only handling situation where winningMatchUp is in same structure
  if (winnerMatchUp && winnerMatchUp.structureId === structure?.structureId && !isLuckyDraw) {
    // NOTE: error conditions are ignored
    advanceWinner({
      drawPositionToAdvance,
      inContextDrawMatchUps,
      sourceDrawPositions,
      tournamentRecord,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
    });
  }

  // only handling situation where a BYE is being placed in linked structure
  // and linked structure is NOT the same structure
  if (loserMatchUp && losingDrawPosiitonIsBye && loserMatchUp.structureId !== structure?.structureId) {
    const { roundNumber } = loserMatchUp;

    if (roundNumber === 1) {
      const result = assignDrawPositionBye({
        structureId: loserTargetLink.target.structureId,
        drawPosition: loserTargetDrawPosition,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (result.error) return result;
    } else {
      assignFedDrawPositionBye({
        loserTargetDrawPosition,
        tournamentRecord,
        loserTargetLink,
        drawDefinition,
        loserMatchUp,
        matchUpsMap,
        event,
      });
    }
  }

  return { ...SUCCESS };
}

function advanceWinner({
  drawPositionToAdvance,
  inContextDrawMatchUps,
  sourceDrawPositions,
  tournamentRecord,
  drawDefinition,
  winnerMatchUp,
  matchUpsMap,
  event,
}) {
  const stack = 'advanceWinner';
  const noContextWinnerMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId,
  );
  const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = getPositionAssignments({ structure });
  const drawPositionToAdvanceAssigment = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === drawPositionToAdvance,
  );
  const drawPositionToAdvanceIsBye = drawPositionToAdvanceAssigment?.bye;
  const existingDrawPositions = noContextWinnerMatchUp.drawPositions?.filter(Boolean);
  const existingAssignments = positionAssignments?.filter((assignment) =>
    existingDrawPositions?.includes(assignment.drawPosition),
  );

  const advancingAssignmentIsBye = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === drawPositionToAdvance,
  );

  /// ????????????????????????????????????????
  // This may be unnecessary....
  const priorPair = sourceDrawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);
  const priorPairAssignment = priorPair && existingAssignments?.find(({ drawPosition }) => drawPosition === priorPair);
  const priorPairIsBye = priorPairAssignment?.bye;
  const isByeAdvancedBye = drawPositionToAdvanceIsBye && priorPairIsBye;
  if (isByeAdvancedBye) console.log({ isByeAdvancedBye });
  /// ????????????????????????????????????????

  if (existingDrawPositions?.length > 1 && drawPositionToAdvanceIsBye && !priorPairIsBye) {
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }
  const pairedDrawPosition = existingDrawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);

  let drawPositionAssigned = isByeAdvancedBye;
  // always ensure there are two drawPositions to iterate over
  const twoDrawPositions = [
    ...(noContextWinnerMatchUp.drawPositions || []).filter(Boolean),
    undefined,
    undefined,
  ].slice(0, 2);

  const drawPositions = twoDrawPositions
    .map((position) => {
      if ((!position && !drawPositionAssigned) || position === drawPositionToAdvance) {
        drawPositionAssigned = true;
        return drawPositionToAdvance;
      } else {
        return position;
      }
    })
    .sort(numericSort);

  if (!drawPositionAssigned) {
    console.log('@@@@@@@', {
      advancingAssignmentIsBye,
      drawPositionToAdvance,
      existingAssignments,
    });
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }

  const pairedDrawPositionIsBye = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === pairedDrawPosition,
  )?.bye;
  const drawPositionIsBye = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === drawPositionToAdvance,
  )?.bye;

  const matchUpStatus = drawPositionIsBye || pairedDrawPositionIsBye ? BYE : TO_BE_PLAYED;

  Object.assign(noContextWinnerMatchUp, {
    matchUpStatus,
    score: undefined,
    winningSide: undefined,
    drawPositions,
  });

  const changedDrawPosition = noContextWinnerMatchUp.drawPositions.find(
    (position) => !twoDrawPositions.includes(position),
  );

  pushGlobalLog({
    method: stack,
    color: 'brightyellow',
    changedDrawPosition,
    pairedDrawPositionIsBye,
    drawPositionIsBye,
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    matchUp: noContextWinnerMatchUp,
    eventId: event?.eventId,
    context: stack,
    drawDefinition,
  });

  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, loserTargetDrawPosition },
  } = positionTargets({
    matchUpId: winnerMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });

  if (pairedDrawPositionIsBye || drawPositionIsBye) {
    const advancingDrawPosition = pairedDrawPositionIsBye ? drawPositionToAdvance : pairedDrawPosition;

    if (advancingDrawPosition) {
      advanceDrawPosition({
        drawPositionToAdvance: advancingDrawPosition,
        matchUpId: winnerMatchUp.matchUpId,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
      });
    } else if (drawPositionIsBye && loserTargetLink && loserMatchUp) {
      if (loserMatchUp.feedRound) {
        assignFedDrawPositionBye({
          loserTargetDrawPosition,
          tournamentRecord,
          loserTargetLink,
          drawDefinition,
          loserMatchUp,
          matchUpsMap,
        });
      } else {
        const sourceStructureRoundPosition = winnerMatchUp.roundPosition;
        // loser drawPosition in target structure is determined bye even/odd
        const targetDrawPositionIndex = 1 - (sourceStructureRoundPosition % 2);
        const targetDrawPosition = loserMatchUp.drawPositions[targetDrawPositionIndex];

        const result = assignDrawPositionBye({
          structureId: loserTargetLink.target.structureId,
          drawPosition: targetDrawPosition,
          tournamentRecord,
          drawDefinition,
          event,
        });
        if (result.error) return result;
      }
    }
  }
}

type AssignFedDrawPositionByeType = {
  loserTargetDrawPosition: number;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  loserMatchUp: HydratedMatchUp;
  matchUpsMap: MatchUpsMap;
  loserTargetLink: any;
  event?: Event;
};

function assignFedDrawPositionBye({
  loserTargetDrawPosition,
  tournamentRecord,
  loserTargetLink,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
}: AssignFedDrawPositionByeType) {
  const { roundNumber } = loserMatchUp;

  const stack = 'assignFedDrawPositionBye';
  pushGlobalLog({ method: stack, color: 'cyan', loserTargetDrawPosition });

  const mappedMatchUps = matchUpsMap?.mappedMatchUps || {};
  const loserStructureMatchUps = mappedMatchUps[loserMatchUp.structureId].matchUps;
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: loserTargetDrawPosition,
    matchUps: loserStructureMatchUps,
  });
  if (initialRoundNumber === roundNumber) {
    const result = assignDrawPositionBye({
      structureId: loserTargetLink.target.structureId,
      drawPosition: loserTargetDrawPosition,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result.error) return result;
  }
}
