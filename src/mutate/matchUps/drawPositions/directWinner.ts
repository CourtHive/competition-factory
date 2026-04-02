import { removeLineUpSubstitutions } from '../../drawDefinitions/removeLineUpSubstitutions';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { assignDrawPosition } from './positionAssignment';
import { modifyMatchUpNotice } from '../../notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { assignMatchUpDrawPosition } from './assignMatchUpDrawPosition';
import { assignSeed } from '../../drawDefinitions/entryGovernor/seedAssignment';
import { findStructure } from '@Acquire/findStructure';

import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

export function directWinner({
  winnerMatchUpDrawPositionIndex,
  inContextDrawMatchUps,
  projectedWinningSide,
  sourceMatchUpStatus,
  winningDrawPosition,
  tournamentRecord,
  winnerTargetLink,
  sourceMatchUpId,
  drawDefinition,
  winnerMatchUp,
  dualMatchUp,
  matchUpsMap,
  event,
}): ResultType {
  const stack = 'directWinner';

  if (winnerTargetLink) {
    const result: any = directWinnerViaLink({
      winnerMatchUpDrawPositionIndex,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      winningDrawPosition,
      tournamentRecord,
      winnerTargetLink,
      sourceMatchUpId,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
      stack,
    });
    if (result?.error) return result;
  } else {
    const result = assignMatchUpDrawPosition({
      matchUpId: winnerMatchUp.matchUpId,
      drawPosition: winningDrawPosition,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      matchUpsMap,
    });
    if (result.error) return result;
  }

  if (dualMatchUp && projectedWinningSide) {
    propagateLineUp({
      projectedWinningSide,
      tournamentRecord,
      drawDefinition,
      winnerMatchUp,
      dualMatchUp,
      matchUpsMap,
      stack,
    });
  }

  return { ...SUCCESS };
}

function directWinnerViaLink({
  winnerMatchUpDrawPositionIndex,
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  winningDrawPosition,
  tournamentRecord,
  winnerTargetLink,
  sourceMatchUpId,
  drawDefinition,
  winnerMatchUp,
  matchUpsMap,
  event,
  stack,
}) {
  const targetMatchUpDrawPositions = winnerMatchUp.drawPositions || [];
  const targetMatchUpDrawPosition = targetMatchUpDrawPositions[winnerMatchUpDrawPositionIndex];

  const sourceStructureId = winnerTargetLink.source.structureId;
  const result = findStructure({ structureId: sourceStructureId, drawDefinition });
  if (result.error) return result;
  const { structure } = result;

  const { positionAssignments: sourcePositionAssignments } = structureAssignedDrawPositions({
    structureId: sourceStructureId,
    drawDefinition,
  });

  const relevantSourceAssignment = sourcePositionAssignments?.find(
    (assignment) => assignment.drawPosition === winningDrawPosition,
  );
  const winnerParticipantId = relevantSourceAssignment?.participantId;

  const targetStructureId = winnerTargetLink.target.structureId;
  const { positionAssignments: targetPositionAssignments } = structureAssignedDrawPositions({
    structureId: targetStructureId,
    drawDefinition,
  });

  const relevantAssignment = targetPositionAssignments?.find(
    (assignment) => assignment.participantId === winnerParticipantId,
  );
  const winnerExistingDrawPosition = relevantAssignment?.drawPosition;

  const unfilledTargetMatchUpDrawPositions = targetPositionAssignments
    ?.filter((assignment) => {
      const inTarget = targetMatchUpDrawPositions.includes(assignment.drawPosition);
      const unfilled = !assignment.participantId && !assignment.bye && !assignment.qualifier;
      return inTarget && unfilled;
    })
    .map((assignment) => assignment.drawPosition);
  const targetDrawPositionIsUnfilled = unfilledTargetMatchUpDrawPositions?.includes(targetMatchUpDrawPosition);

  if (winnerParticipantId && winnerTargetLink.target.roundNumber === 1 && targetDrawPositionIsUnfilled) {
    assignDrawPosition({
      drawPosition: targetMatchUpDrawPosition,
      participantId: winnerParticipantId,
      structureId: targetStructureId,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
  } else if (winnerParticipantId && unfilledTargetMatchUpDrawPositions?.length) {
    const drawPosition = unfilledTargetMatchUpDrawPositions.pop();
    drawPosition &&
      assignDrawPosition({
        participantId: winnerParticipantId,
        structureId: targetStructureId,
        inContextDrawMatchUps,
        sourceMatchUpStatus,
        tournamentRecord,
        drawDefinition,
        drawPosition,
        matchUpsMap,
        event,
      });
  } else if (winnerExistingDrawPosition) {
    const assignResult = assignMatchUpDrawPosition({
      drawPosition: winnerExistingDrawPosition,
      matchUpId: winnerMatchUp.matchUpId,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      matchUpsMap,
    });
    if (assignResult.error) return decorateResult({ result: assignResult, stack });
  } else if (structure?.stage !== QUALIFYING) {
    const error = 'winner target position unavaiallble';
    console.log(error);
    decorateResult({ stack, result: { error } });
  }

  if (structure?.seedAssignments && structure.structureId !== targetStructureId) {
    const seedAssignment = structure.seedAssignments.find(
      ({ participantId }) => participantId === winnerParticipantId,
    );
    const participantId = seedAssignment?.participantId;
    if (seedAssignment && participantId) {
      assignSeed({
        eventId: winnerMatchUp?.eventId,
        structureId: targetStructureId,
        ...seedAssignment,
        tournamentRecord,
        drawDefinition,
        participantId,
      });
    }
  }

  return undefined;
}

function propagateLineUp({
  projectedWinningSide,
  tournamentRecord,
  drawDefinition,
  winnerMatchUp,
  dualMatchUp,
  matchUpsMap,
  stack,
}) {
  const side = dualMatchUp.sides?.find((s) => s.sideNumber === projectedWinningSide);
  if (!side?.lineUp) return;

  const source = dualMatchUp.roundPosition;
  const target = winnerMatchUp.roundPosition;
  const targetSideNumber = (source === target && source !== 1) || Math.floor(source / 2) === target ? 2 : 1;

  const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === winnerMatchUp.matchUpId);

  const updatedSides = [1, 2].map((sideNumber) => {
    const existingSide = targetMatchUp.sides?.find((s) => s.sideNumber === sideNumber) || {};
    return { ...existingSide, sideNumber };
  });

  targetMatchUp.sides = updatedSides;
  const targetSide = targetMatchUp.sides.find((s) => s.sideNumber === targetSideNumber);

  if (targetSide) {
    const filteredLineUp = side.lineUp?.filter((assignment) => assignment?.participantId);

    targetSide.lineUp = removeLineUpSubstitutions({ lineUp: filteredLineUp });

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: winnerMatchUp?.eventId,
      matchUp: targetMatchUp,
      context: stack,
      drawDefinition,
    });
  }
}
