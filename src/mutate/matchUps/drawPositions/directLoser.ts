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

  if (fedDrawPositionFMLC) {
    const result = loserLinkFedFMLC();
    if (result.context) Object.assign(context, result.context);
    if (result.error) return decorateResult({ result, stack });
  } else if (isFirstRoundValidDrawPosition) {
    const result = asssignLoserDrawPosition();
    if (result.context) Object.assign(context, result.context);
    if (result.error) return decorateResult({ result, stack });
  } else if (loserParticipantId && (isFeedRound || unfilledTargetMatchUpDrawPositions?.length)) {
    // take the lowest unfilled draw position in the target matchUp;
    // applies to feed rounds (roundNumber > 1) and also when both winner and loser
    // feed into the same target matchUp (e.g., double elimination decider)
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
    if (result.error) return decorateResult({ result, stack });
    // if validExitToPropagate is true get the matchUpId of the targetMatchUp and set its status to the sourceMatchUpStatus
    if (!result.error && validExitToPropagate && propagateExitStatus) {
      return { stack, context: { progressExitStatus: true, loserParticipantId } };
    }
  } else {
    const error = !targetDrawPositionIsUnfilled ? DRAW_POSITION_OCCUPIED : INVALID_DRAW_POSITION;
    return decorateResult({
      context: { loserDrawPosition, loserTargetLink, targetDrawPositionIsUnfilled },
      result: { error },
      stack,
    });
  }

  if (structure?.seedAssignments && structure.structureId !== targetStructureId) {
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

  if (dualMatchUp && projectedWinningSide) {
    // propagated lineUp
    const side = dualMatchUp.sides?.find((side) => side.sideNumber === 3 - projectedWinningSide);
    if (side?.lineUp) {
      const { roundNumber, eventId } = loserMatchUp;
      const { roundPosition } = dualMatchUp;
      // for matchUps fed to different structures, sideNumber is always 1 when roundNumber > 1 (fed position)
      // when roundNumber === 1 then it is even/odd calculated as remainder of roundPositon % 2 + 1
      const targetSideNumber = roundNumber === 1 ? 2 - (roundPosition % 2) : 1;

      const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);

      const updatedSides = [1, 2].map((sideNumber) => {
        const existingSide = targetMatchUp.sides?.find((side) => side.sideNumber === sideNumber) || {};
        return { ...existingSide, sideNumber };
      });

      targetMatchUp.sides = updatedSides;
      const targetSide = targetMatchUp.sides.find((side) => side.sideNumber === targetSideNumber);

      // attach to appropriate side of winnerMatchUp
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
  }

  return decorateResult({ result: { ...SUCCESS }, stack, context });

  function loserLinkFedFMLC() {
    const stack = 'loserLinkFedFMLC';
    if (validForConsolation) {
      return decorateResult({ result: asssignLoserDrawPosition(), stack });
    } else {
      return decorateResult({ result: assignLoserPositionBye(), stack });
    }
  }

  function assignLoserPositionBye() {
    const result = assignDrawPositionBye({
      drawPosition: loserBackdrawPosition,
      structureId: targetStructureId,
      tournamentRecord,
      drawDefinition,
      event,
    });
    return decorateResult({ result, stack: 'assignLoserPositionBye' });
  }

  function asssignLoserDrawPosition() {
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

    // if propagateExitStatus is true get the matchUpId of the targetMatchUp and set its status to the sourceMatchUpStatus
    if (!result.error && validExitToPropagate && propagateExitStatus) {
      return { stack, context: { progressExitStatus: true } };
    }

    return decorateResult({ result, stack: 'assignLoserDrawPosition' });
  }
}
