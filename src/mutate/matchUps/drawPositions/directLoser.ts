import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';
import { numericSort } from '@Tools/sorting';

// constants
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  DRAW_POSITION_OCCUPIED,
  INVALID_DRAW_POSITION,
  MISSING_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

/*
  FIRST_MATCH_LOSER_CONSOLATION linkCondition... check whether it is a participant's first 
*/
export function directLoser(params): ResultType {
  const {
    loserMatchUpDrawPositionIndex,
    inContextDrawMatchUps,
    projectedWinningSide,
    propagateExitStatus,
    sourceMatchUpStatus,
    loserDrawPosition,
    tournamentRecord,
    loserTargetLink,
    drawDefinition,
    loserMatchUp,
    dualMatchUp,
    matchUpsMap,
    event,
  } = params;

  const stack = 'directLoser';
  const loserLinkCondition = loserTargetLink.linkCondition;
  const targetMatchUpDrawPositions = loserMatchUp.drawPositions || [];

  const fedDrawPositionFMLC =
    loserLinkCondition === FIRST_MATCHUP &&
    loserMatchUp.roundNumber === 2 &&
    Math.min(...targetMatchUpDrawPositions.filter(Boolean));

  const targetMatchUpDrawPosition = fedDrawPositionFMLC || targetMatchUpDrawPositions[loserMatchUpDrawPositionIndex];
  const loserBackdrawPosition = fedDrawPositionFMLC || targetMatchUpDrawPositions[1 - loserMatchUpDrawPositionIndex];

  const sourceStructureId = loserTargetLink.source.structureId;
  const { structure } = findStructure({
    structureId: sourceStructureId,
    drawDefinition,
  });
  const { matchUps: sourceMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
    event,
  });

  const drawPositionMatchUps = sourceMatchUps.filter((matchUp) => matchUp.drawPositions?.includes(loserDrawPosition));

  // in this calculation BYEs and WALKOVERs are not counted as wins
  // as well as DEFAULTED when there is no score component
  const loserDrawPositionWins = drawPositionMatchUps.filter((matchUp) => {
    const drawPositionSide = matchUp.sides.find((side) => side.drawPosition === loserDrawPosition);
    const unscoredOutcome =
      matchUp.matchUpStatus === WALKOVER || (matchUp.matchUpStatus === DEFAULTED && !checkScoreHasValue(matchUp));
    return drawPositionSide?.sideNumber === matchUp.winningSide && !unscoredOutcome;
  });

  const validForConsolation = loserLinkCondition === FIRST_MATCHUP && loserDrawPositionWins.length === 0;

  const { positionAssignments: sourcePositionAssignments } = structureAssignedDrawPositions({
    structureId: sourceStructureId,
    drawDefinition,
  });

  const relevantAssignment = sourcePositionAssignments?.find(
    (assignment) => assignment.drawPosition === loserDrawPosition,
  );
  const loserParticipantId = relevantAssignment?.participantId;
  const context = { loserParticipantId };

  const targetStructureId = loserTargetLink.target.structureId;
  const { positionAssignments: targetPositionAssignments } = structureAssignedDrawPositions({
    structureId: targetStructureId,
    drawDefinition,
  });

  const targetMatchUpPositionAssignments = targetPositionAssignments?.filter(({ drawPosition }) =>
    targetMatchUpDrawPositions.includes(drawPosition),
  );

  const loserAlreadyDirected = targetMatchUpPositionAssignments?.some(
    (assignment) => assignment.participantId && loserParticipantId && assignment.participantId === loserParticipantId,
  );

  const validExitToPropagate =
    propagateExitStatus && [RETIRED, WALKOVER, DEFAULTED].includes(sourceMatchUpStatus || '');

  if (loserAlreadyDirected) {
    return { ...SUCCESS, stack };
  }

  const unfilledTargetMatchUpDrawPositions = targetMatchUpPositionAssignments
    ?.filter((assignment) => {
      const inTarget = targetMatchUpDrawPositions.includes(assignment.drawPosition);
      const unfilled = !assignment.participantId && !assignment.bye && !assignment.qualifier;
      return inTarget && unfilled;
    })
    .map((assignment) => assignment.drawPosition);

  const targetDrawPositionIsUnfilled = unfilledTargetMatchUpDrawPositions?.includes(targetMatchUpDrawPosition);
  const isFeedRound = loserTargetLink.target.roundNumber > 1 && unfilledTargetMatchUpDrawPositions?.length;
  const isFirstRoundValidDrawPosition = loserTargetLink.target.roundNumber === 1 && targetDrawPositionIsUnfilled;

  const placementResult: any = placeLoser({
    fedDrawPositionFMLC,
    isFirstRoundValidDrawPosition,
    loserParticipantId,
    isFeedRound,
    unfilledTargetMatchUpDrawPositions,
    targetDrawPositionIsUnfilled,
    validForConsolation,
    targetMatchUpDrawPosition,
    loserBackdrawPosition,
    targetStructureId,
    inContextDrawMatchUps,
    sourceMatchUpStatus,
    validExitToPropagate,
    propagateExitStatus,
    loserDrawPosition,
    loserTargetLink,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (placementResult.context) Object.assign(context, placementResult.context);
  if (placementResult.error) return decorateResult({ result: placementResult, stack });
  if (placementResult.earlyReturn) return placementResult.earlyReturn;

  propagateLoserSeed({
    loserParticipantId,
    targetStructureId,
    tournamentRecord,
    drawDefinition,
    loserMatchUp,
    structure,
  });

  propagateLoserLineUp({
    projectedWinningSide,
    tournamentRecord,
    drawDefinition,
    loserMatchUp,
    dualMatchUp,
    matchUpsMap,
    stack,
  });

  return decorateResult({ result: { ...SUCCESS }, stack, context });
}

function placeLoser({
  fedDrawPositionFMLC,
  isFirstRoundValidDrawPosition,
  loserParticipantId,
  isFeedRound,
  unfilledTargetMatchUpDrawPositions,
  targetDrawPositionIsUnfilled,
  validForConsolation,
  targetMatchUpDrawPosition,
  loserBackdrawPosition,
  targetStructureId,
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  validExitToPropagate,
  propagateExitStatus,
  loserDrawPosition,
  loserTargetLink,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
}) {
  const assignLoserToTarget = () => {
    const result = loserParticipantId
      ? assignDrawPosition({
          drawPosition: targetMatchUpDrawPosition,
          participantId: loserParticipantId,
          structureId: targetStructureId,
          inContextDrawMatchUps,
          sourceMatchUpStatus,
          tournamentRecord,
          drawDefinition,
          matchUpsMap,
          event,
        })
      : { error: MISSING_PARTICIPANT_ID };

    if (!result.error && validExitToPropagate && propagateExitStatus) {
      return { context: { progressExitStatus: true } };
    }

    return decorateResult({ result, stack: 'assignLoserDrawPosition' });
  };

  if (fedDrawPositionFMLC) {
    const innerStack = 'loserLinkFedFMLC';
    if (validForConsolation) {
      return decorateResult({ result: assignLoserToTarget(), stack: innerStack });
    }
    const byeResult = assignDrawPositionBye({
      drawPosition: loserBackdrawPosition,
      structureId: targetStructureId,
      tournamentRecord,
      drawDefinition,
      event,
    });
    return decorateResult({ result: decorateResult({ result: byeResult, stack: 'assignLoserPositionBye' }), stack: innerStack });
  }

  if (isFirstRoundValidDrawPosition) {
    return assignLoserToTarget();
  }

  if (loserParticipantId && (isFeedRound || unfilledTargetMatchUpDrawPositions?.length)) {
    unfilledTargetMatchUpDrawPositions.sort(numericSort);
    const fedDrawPosition = unfilledTargetMatchUpDrawPositions[0];
    const result = assignDrawPosition({
      participantId: loserParticipantId,
      structureId: targetStructureId,
      drawPosition: fedDrawPosition,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result.error) return result;
    if (validExitToPropagate && propagateExitStatus) {
      return { earlyReturn: { stack: 'directLoser', context: { progressExitStatus: true, loserParticipantId } } };
    }
    return { ...SUCCESS };
  }

  const error = !targetDrawPositionIsUnfilled ? DRAW_POSITION_OCCUPIED : INVALID_DRAW_POSITION;
  return {
    context: { loserDrawPosition, loserTargetLink, targetDrawPositionIsUnfilled },
    error,
  };
}

function propagateLoserSeed({
  loserParticipantId,
  targetStructureId,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  structure,
}) {
  if (!structure?.seedAssignments || structure.structureId === targetStructureId) return;

  const seedAssignment = structure.seedAssignments.find(({ participantId }) => participantId === loserParticipantId);
  const participantId = seedAssignment?.participantId;
  if (seedAssignment && participantId) {
    assignSeed({
      eventId: loserMatchUp?.eventId,
      structureId: targetStructureId,
      ...seedAssignment,
      tournamentRecord,
      drawDefinition,
      participantId,
    });
  }
}

function propagateLoserLineUp({
  projectedWinningSide,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  dualMatchUp,
  matchUpsMap,
  stack,
}) {
  if (!dualMatchUp || !projectedWinningSide) return;

  const side = dualMatchUp.sides?.find((side) => side.sideNumber === 3 - projectedWinningSide);
  if (!side?.lineUp) return;

  const { roundNumber, eventId } = loserMatchUp;
  const { roundPosition } = dualMatchUp;
  const targetSideNumber = roundNumber === 1 ? 2 - (roundPosition % 2) : 1;

  const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);

  const updatedSides = [1, 2].map((sideNumber) => {
    const existingSide = targetMatchUp.sides?.find((s) => s.sideNumber === sideNumber) || {};
    return { ...existingSide, sideNumber };
  });

  targetMatchUp.sides = updatedSides;
  const targetSide = targetMatchUp.sides.find((s) => s.sideNumber === targetSideNumber);

  if (targetSide) {
    targetSide.lineUp = removeLineUpSubstitutions({ lineUp: side.lineUp });

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUp: targetMatchUp,
      context: stack,
      drawDefinition,
      eventId,
    });
  }
}
