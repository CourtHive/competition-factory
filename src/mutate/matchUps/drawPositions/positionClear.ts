import { modifyRoundRobinMatchUpsStatus } from '@Mutate/matchUps/matchUpStatus/modifyRoundRobinMatchUpsStatus';
import { getPositionAssignments, structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findStructure } from '@Acquire/findStructure';
import { ensureInt } from '@Tools/ensureInt';
import { isExit } from '@Validators/isExit';
import { overlap } from '@Tools/arrays';

// constants and types
import { DrawDefinition, Event, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER, DRAW } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';

import {
  DRAW_POSITION_ACTIVE,
  MISSING_DRAW_POSITION,
  DRAW_POSITION_NOT_CLEARED,
  ErrorType,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type ClearDrawPositionArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  participantId?: string;
  drawPosition?: number;
  structureId: string;
  event?: Event;
};
export function clearDrawPosition(params: ClearDrawPositionArgs): ResultType & { participantId?: string } {
  let { inContextDrawMatchUps, participantId, drawPosition } = params;
  const { tournamentRecord, drawDefinition, structureId, matchUpsMap, event } = params;
  const { structure } = findStructure({ drawDefinition, structureId });
  const positionAssignments =
    structureAssignedDrawPositions({
      drawDefinition,
      structure,
    }).positionAssignments || [];

  const existingAssignment = positionAssignments.find(
    (assignment) =>
      (participantId && assignment.participantId === participantId) ||
      (drawPosition && assignment.drawPosition === drawPosition),
  );

  if (existingAssignment && participantId && !drawPosition) {
    drawPosition = existingAssignment?.drawPosition;
  }
  if (!drawPosition) return { error: MISSING_DRAW_POSITION };
  if (!participantId) participantId = existingAssignment?.participantId;

  const { activeDrawPositions } = getStructureDrawPositionProfiles({
    drawDefinition,
    structureId,
  });
  const drawPositionIsActive = activeDrawPositions.includes(drawPosition);

  // drawPosition may not be cleared if:
  // 1. drawPosition has been advanced by winning a matchUp
  // 2. drawPosition is paired with another drawPosition which has been advanced by winning a matchUp
  if (drawPositionIsActive) {
    return { error: DRAW_POSITION_ACTIVE };
  }

  if (!inContextDrawMatchUps) {
    ({ matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }));
  }

  const result = drawPositionRemovals({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    drawPosition,
    matchUpsMap,
    event,
  });

  if (!result.drawPositionCleared) return { error: DRAW_POSITION_NOT_CLEARED };

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  return { ...SUCCESS, participantId };
}

type DrawPositionRemovalsArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
  structureId: string;
  event?: Event;
};
export function drawPositionRemovals({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: DrawPositionRemovalsArgs) {
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  const positionAssignments =
    structureAssignedDrawPositions({
      drawDefinition,
      structure,
    }).positionAssignments || [];

  const drawPositionCleared = positionAssignments.some((assignment) => {
    if (assignment.drawPosition === drawPosition) {
      delete assignment.participantId;
      delete assignment.qualifier;
      delete assignment.bye;
      return true;
    }
    return undefined;
  });

  if (structure.structureType === CONTAINER) {
    modifyRoundRobinMatchUpsStatus({
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
    });
    return { drawPositionCleared, ...SUCCESS };
  }

  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps: structureMatchUps } = getAllStructureMatchUps({
    drawDefinition,
    matchUpFilters,
    matchUpsMap,
    structure,
    event,
  });
  const { roundProfile, roundMatchUps } = getRoundMatchUps({
    matchUps: structureMatchUps,
  });
  const profileKeys = roundProfile && Object.keys(roundProfile);
  const roundNumbers = profileKeys?.map((roundNumber) => ensureInt(roundNumber));

  let targetDrawPosition: any = drawPosition;
  const pairingDetails = roundNumbers
    ?.map((roundNumber) => {
      // find the pair of drawPositions which includes the targetDrawPosition
      const profile = roundProfile?.[roundNumber];
      const relevantPair = profile?.pairedDrawPositions?.find((drawPositions) =>
        drawPositions.includes(targetDrawPosition),
      );
      // find the drawPosition which is paired with the targetDrawPosition
      const pairedDrawPosition: any = relevantPair?.find(
        (currentDrawPosition) => currentDrawPosition !== targetDrawPosition,
      );
      // find the assignment for the paired drawPosition
      const pairedDrawPositionAssignment = positionAssignments.find(
        (assignment) => assignment.drawPosition === pairedDrawPosition,
      );
      const nextRoundProfile = roundProfile?.[roundNumber + 1];
      // whether or not the pairedDrawPosition is a BYE
      const pairedDrawPositionIsBye = pairedDrawPositionAssignment?.bye;
      // whether or not the pairedDrawPosition is present in the next round
      const pairedDrawPositionInNextRound = nextRoundProfile?.pairedDrawPositions?.find((pairedPositions: any) =>
        pairedPositions.includes(pairedDrawPosition),
      );
      // pairedDrawPosition is a transitiveBye if it is a BYE and if it is present in next round
      const isTransitiveBye =
        pairedDrawPositionIsBye &&
        pairedDrawPositionInNextRound &&
        nextRoundProfile?.drawPositions?.includes(pairedDrawPosition);
      const pairedDrawPositionByeAdvancedPair = !isTransitiveBye && pairedDrawPositionInNextRound;

      const result = relevantPair && {
        pairedDrawPositionByeAdvancedPair,
        pairedDrawPosition,
        targetDrawPosition,
        relevantPair,
        roundNumber,
      };

      // if the pairedDrawPosition is a BYE, continue search with pairedDrawPoaition as targetDrawPosition
      if (isTransitiveBye) targetDrawPosition = pairedDrawPosition;

      return result;
    })
    .filter((f) => f?.targetDrawPosition);

  const tasks: any = pairingDetails?.reduce((tasks, pairingDetail: any) => {
    const { roundNumber, relevantPair, targetDrawPosition, pairedDrawPosition, pairedDrawPositionByeAdvancedPair } =
      pairingDetail;
    const roundRemoval = { roundNumber, targetDrawPosition, relevantPair };
    const byeAdvancedRemoval = pairedDrawPositionByeAdvancedPair && {
      roundNumber: roundNumber + 1,
      targetDrawPosition: pairedDrawPosition,
      relevantPair: pairedDrawPositionByeAdvancedPair,
      subsequentRoundRemoval: true,
    };
    const newTasks = [roundRemoval, byeAdvancedRemoval].filter(Boolean);
    return tasks.concat(...newTasks);
  }, []);

  tasks?.forEach(({ roundNumber, targetDrawPosition, relevantPair }) => {
    const targetMatchUp = roundMatchUps?.[roundNumber].find((matchUp) =>
      overlap(matchUp.drawPositions?.filter(Boolean), relevantPair.filter(Boolean)),
    );
    if (!targetMatchUp) {
      return;
    }

    removeSubsequentRoundsParticipant({
      inContextDrawMatchUps,
      targetDrawPosition,
      tournamentRecord,
      drawDefinition,
      structureId,
      roundNumber,
      matchUpsMap,
    });

    removeDrawPosition({
      inContextDrawMatchUps,
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      targetMatchUp,
      drawPosition,
      matchUpsMap,
      structure,
      event,
    });
  });

  return { tasks, drawPositionCleared, positionAssignments };
}

function removeSubsequentRoundsParticipant({
  inContextDrawMatchUps,
  targetDrawPosition,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  roundNumber,
  structureId,
}) {
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (structure.structureType === CONTAINER) return;

  matchUpsMap = matchUpsMap || getMatchUpsMap({ drawDefinition });
  const mappedMatchUps = matchUpsMap?.mappedMatchUps || {};
  const matchUps = mappedMatchUps[structureId].matchUps;

  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: targetDrawPosition,
    matchUps,
  });

  const relevantMatchUps = matchUps?.filter(
    (matchUp) =>
      matchUp.roundNumber >= roundNumber &&
      matchUp.roundNumber !== initialRoundNumber &&
      matchUp.drawPositions?.includes(targetDrawPosition),
  );

  const positionAssignments =
    getPositionAssignments({
      drawDefinition,
      structureId,
    }).positionAssignments ?? [];

  relevantMatchUps?.forEach((matchUp) =>
    removeDrawPosition({
      drawPosition: targetDrawPosition,
      targetMatchUp: matchUp,
      inContextDrawMatchUps,
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
    }),
  );
  return { ...SUCCESS };
}

type RemoveDrawPositionArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  positionAssignments: PositionAssignment[];
  targetMatchUp: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
  structure: Structure;
  event?: Event;
};
function removeDrawPosition({
  inContextDrawMatchUps,
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  targetMatchUp,
  drawPosition,
  matchUpsMap,
  structure,
  event,
}: RemoveDrawPositionArgs) {
  const stack = 'removeDrawPosition';
  const initialDrawPositions = targetMatchUp.drawPositions?.slice();
  const initialMatchUpStatus = targetMatchUp.matchUpStatus;
  const initialWinningSide = targetMatchUp.winningSide;

  matchUpsMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const mappedMatchUps = matchUpsMap.mappedMatchUps;
  const matchUps = mappedMatchUps[structure.structureId].matchUps;
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition,
    matchUps,
  });

  if (targetMatchUp.roundNumber && initialRoundNumber && targetMatchUp.roundNumber > initialRoundNumber) {
    const drawPositions: any[] = (targetMatchUp.drawPositions ?? []).map((currentDrawPosition) =>
      currentDrawPosition === drawPosition ? undefined : currentDrawPosition,
    );
    targetMatchUp.drawPositions = drawPositions as number[];
  }

  if (targetMatchUp.matchUpType === TEAM) {
    const inContextTargetMatchUp = inContextDrawMatchUps?.find(
      (matchUp) => matchUp.matchUpId === targetMatchUp.matchUpId,
    );
    const sides: any[] = inContextTargetMatchUp?.sides ?? [];
    const drawPositionSideIndex = sides.reduce(
      (index, side, i) => (side.drawPosition === drawPosition ? i : index),
      undefined,
    );

    if (drawPositionSideIndex !== undefined && targetMatchUp.sides?.[drawPositionSideIndex]?.lineUp) {
      delete targetMatchUp.sides?.[drawPositionSideIndex].lineUp;

      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        context: `${stack}-TEAM`,
        eventId: event?.eventId,
        matchUp: targetMatchUp,
        drawDefinition,
      });
    }
  }

  const targetData = positionTargets({
    matchUpId: targetMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });

  const {
    targetLinks: { winnerTargetLink },
    targetMatchUps: {
      loserMatchUp,
      winnerMatchUp,
      loserMatchUpDrawPositionIndex,
      // winnerMatchUpDrawPositionIndex,
    },
  } = targetData;

  const matchUpAssignments = positionAssignments.filter(({ drawPosition }) =>
    targetMatchUp.drawPositions?.includes(drawPosition),
  );
  const matchUpContainsBye = matchUpAssignments.filter((assignment) => assignment.bye).length;

  const newMatchUpStatus =
    (matchUpContainsBye && BYE) ||
    (targetMatchUp.matchUpStatus && isExit(targetMatchUp.matchUpStatus) && targetMatchUp.matcHUpStatus) ||
    TO_BE_PLAYED;

  targetMatchUp.matchUpStatus = newMatchUpStatus;

  // if the matchUpStatus is WALKOVER then it is DOUBLE_WALKOVER produced
  // if the matchUpStatus is DEFAULTED then it is DOUBLE_DEFAULT produced
  // ... and the winningSide must be removed
  if (targetMatchUp.matchUpStatus && isExit(targetMatchUp.matchUpStatus)) targetMatchUp.winningSide = undefined;

  const removedDrawPosition = initialDrawPositions?.find(
    (position) => !targetMatchUp.drawPositions?.includes(position),
  );
  const noChange =
    initialDrawPositions?.includes(drawPosition) &&
    initialMatchUpStatus === targetMatchUp.matchUpStatus &&
    initialWinningSide === targetMatchUp.winningSide;

  if (!noChange) {
    if (removedDrawPosition) {
      pushGlobalLog({
        method: stack,
        color: 'brightyellow',
        removedDrawPosition,
      });
    }

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: `${stack}-${drawPosition}`,
      eventId: event?.eventId,
      matchUp: targetMatchUp,
      drawDefinition,
    });
  }

  if (loserMatchUp && loserMatchUp.structureId !== targetData.matchUp.structureId && !matchUpContainsBye) {
    const { drawPositions, roundNumber } = loserMatchUp;

    if (roundNumber === 1) {
      const loserMatchUpDrawPosition = drawPositions[loserMatchUpDrawPositionIndex];

      drawPositionRemovals({
        structureId: loserMatchUp.structureId,
        drawPosition: loserMatchUpDrawPosition,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
      });
    } else {
      // for fed rounds the loserMatchUpDrawPosiiton is always the fed drawPosition
      // which is always the lowest numerical drawPosition
      const loserMatchUpDrawPosition = Math.min(...drawPositions.filter(Boolean));

      const result = consolationCleanup({
        loserMatchUpDrawPosition,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        loserMatchUp,
        matchUpsMap,
        event,
      });
      if (result.error) return decorateResult({ result, stack });

      const mappedMatchUps = matchUpsMap?.mappedMatchUps || {};
      const loserStructureMatchUps = mappedMatchUps[loserMatchUp.structureId].matchUps;

      const { initialRoundNumber } = getInitialRoundNumber({
        drawPosition: loserMatchUpDrawPosition,
        matchUps: loserStructureMatchUps,
      });

      // if clearing a drawPosition from a feed round the initialRoundNumber for the drawPosition must be { roundNumber: 1 }
      if (initialRoundNumber === 1) {
        pushGlobalLog({
          method: stack,
          color: 'brightyellow',
          loserMatchUpDrawPosition,
        });

        drawPositionRemovals({
          structureId: loserMatchUp.structureId,
          drawPosition: loserMatchUpDrawPosition,
          inContextDrawMatchUps,
          tournamentRecord,
          drawDefinition,
          matchUpsMap,
        });
      }
    }
  }

  if (
    winnerMatchUp &&
    winnerMatchUp.structureId !== targetData.matchUp.structureId &&
    // does not apply to traversals that are based on QUALIFYING
    winnerTargetLink.target.feedProfile !== DRAW
  ) {
    /*
    const { structure } = findStructure({
      structureId: targetData.matchUp.structureId,
      drawDefinition,
    });

    if (/* is not a qualifying structure *?)
      console.log('linked structure winnerMatchUp removal', {
        winnerMatchUpDrawPositionIndex,
        winnerTargetLink,
      });
      */
  }

  return { ...SUCCESS };
}

function consolationCleanup({
  loserMatchUpDrawPosition,
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
}): { error?: ErrorType; success?: boolean } {
  const { structure } = findStructure({
    structureId: loserMatchUp.structureId,
    drawDefinition,
  });
  const { positionAssignments } = getPositionAssignments({ structure });
  const assignment = positionAssignments?.find((assignment) => assignment.drawPosition === loserMatchUpDrawPosition);

  if (assignment?.bye) {
    const result = clearDrawPosition({
      drawPosition: loserMatchUpDrawPosition,
      structureId: loserMatchUp.structureId,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}
