// all child matchUps need to be checked for collectionAssignments which need to be removed when collectionDefinition.collectionIds are removed

import { deleteMatchUpsNotice, modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { calculateWinCriteria } from '@Query/matchUp/calculateWinCriteria';
import { getTieFormat } from '@Query/hierarchical/tieFormats/getTieFormat';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { tieFormatTelemetry } from '@Mutate/tieFormat/tieFormatTelemetry';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { writeTieFormat } from '@Mutate/tieFormat/writeTieFormat';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { definedAttributes } from '@Tools/definedAttributes';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DrawDefinition, Event, MatchUp, TieFormat, Tournament } from '@Types/tournamentTypes';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { decorateResult } from '@Functions/global/decorateResult';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import {
  ErrorType,
  MISSING_DRAW_DEFINITION,
  NOT_FOUND,
  NO_MODIFICATIONS_APPLIED,
} from '@Constants/errorConditionConstants';

/*
 * if an eventId is provided, will be removed from an event tieFormat
 * if a drawId is provided, will be removed from a draw tieFormat
 * if a matchUpId is provided, will be removed from matchUp.tieFormat
 * if a structureId is provided, will be removed from structure.tieFormat
 */
type RemoveCollectionDefinitionArgs = {
  updateInProgressMatchUps?: boolean;
  tieFormatComparison?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  tieFormatName?: string;
  collectionId: string;
  structureId?: string;
  matchUpId?: string;
  matchUp?: MatchUp;
  eventId?: string;
  event?: Event;
};

export function removeCollectionDefinition({
  updateInProgressMatchUps = true,
  tieFormatComparison,
  tournamentRecord,
  drawDefinition,
  tieFormatName,
  collectionId,
  structureId,
  matchUpId,
  eventId,
  matchUp,
  event,
}: RemoveCollectionDefinitionArgs): {
  targetMatchUps?: HydratedMatchUp[];
  deletedMatchUpIds?: string[];
  tieFormat?: TieFormat;
  success?: boolean;
  error?: ErrorType;
} {
  const stack = 'removeCollectionDefinition';
  let result = matchUp
    ? undefined
    : getTieFormat({
        drawDefinition,
        structureId,
        matchUpId,
        eventId,
        event,
      });

  if (result?.error) return decorateResult({ result, stack });

  const structure = result?.structure;
  matchUp = matchUp ?? result?.matchUp;
  const existingTieFormat = result?.tieFormat;
  const tieFormat = copyTieFormat(existingTieFormat);

  result = validateTieFormat({ tieFormat });
  if (result.error) return decorateResult({ result, stack });

  const targetCollection = tieFormat?.collectionDefinitions?.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  if (!targetCollection) return decorateResult({ result: { error: NOT_FOUND, collectionId } });

  tieFormat.collectionDefinitions = tieFormat.collectionDefinitions.filter(
    (collectionDefinition) => collectionDefinition.collectionId !== collectionId,
  );

  // if the collectionDefinition being removed contains a collectionGroupNumber,
  // remove the collectionGroup and all references to it in other collectionDefinitions
  if (targetCollection.collectionGroupNumber) {
    tieFormat.collectionDefinitions = tieFormat.collectionDefinitions.map((collectionDefinition) => {
      const { collectionGroupNumber, ...rest } = collectionDefinition;
      if (collectionGroupNumber) {
        // collectionGroupNumber removed
      }
      return rest;
    });
    tieFormat.collectionGroups = tieFormat.collectionGroups.filter(
      ({ groupNumber }) => groupNumber !== targetCollection.collectionGroupNumber,
    );
  }

  // calculate new winCriteria for tieFormat
  // if existing winCriteria is aggregateValue, retain
  const { aggregateValue, valueGoal } = calculateWinCriteria(tieFormat);
  tieFormat.winCriteria = definedAttributes({ aggregateValue, valueGoal });

  // if valueGoal has changed, force renaming of the tieFormat
  const originalValueGoal = existingTieFormat?.winCriteria.valueGoal;
  const wasAggregateValue = existingTieFormat?.winCriteria.aggregateValue;
  if ((originalValueGoal && originalValueGoal !== valueGoal) || (aggregateValue && !wasAggregateValue)) {
    if (tieFormatName) {
      tieFormat.tieFormatName = tieFormatName;
    } else {
      delete tieFormat.tieFormatName;
    }
  }

  const matchUps = getScopedMatchUps({ matchUpId, matchUp, structureId, structure, drawDefinition, event });

  const targetMatchUps = filterTargetMatchUps({
    updateInProgressMatchUps,
    tieFormatComparison,
    collectionId,
    tieFormat,
    matchUps,
  });

  if (!targetMatchUps.length) {
    return { error: NO_MODIFICATIONS_APPLIED };
  }

  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord });

  if (matchUpId && matchUp && updateInProgressMatchUps) {
    const clearResult: any = clearCollectionScores({
      tournamentRecord,
      appliedPolicies,
      drawDefinition,
      collectionId,
      matchUpId,
      matchUp,
      event,
    });
    if (clearResult.error) return clearResult;
    matchUp = clearResult.matchUp;
  }

  const deletedMatchUpIds: string[] = [];
  for (const targetMatchUp of targetMatchUps) {
    processTargetMatchUp({
      deletedMatchUpIds,
      tournamentRecord,
      drawDefinition,
      collectionId,
      tieFormat,
      stack,
      event,
      matchUp: targetMatchUp,
    });
    const scoreResult = updateTargetMatchUpScore({
      updateInProgressMatchUps,
      tournamentRecord,
      appliedPolicies,
      drawDefinition,
      matchUp: targetMatchUp,
      event,
    });
    if (scoreResult?.error) return scoreResult;
  }

  // remove any matchUps which contain collectionId
  if (deletedMatchUpIds.length) {
    // notify subscribers that matchUps have been deleted
    deleteMatchUpsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUpIds: deletedMatchUpIds,
      eventId: event?.eventId,
      drawDefinition,
    });
  }

  const prunedTieFormat = definedAttributes(tieFormat);
  result = validateTieFormat({ tieFormat: prunedTieFormat });
  if (result.error) return decorateResult({ result, stack });

  if (eventId && event) {
    writeTieFormat({ target: event, tieFormat: prunedTieFormat, event });
  } else if (matchUpId && matchUp) {
    writeTieFormat({ target: matchUp, tieFormat: prunedTieFormat, event });
  } else if (structure) {
    writeTieFormat({ target: structure, tieFormat: prunedTieFormat, event });
  } else if (drawDefinition) {
    writeTieFormat({ target: drawDefinition, tieFormat: prunedTieFormat, event });
  } else if (!matchUp || !drawDefinition) {
    return { error: MISSING_DRAW_DEFINITION };
  }

  modifyDrawNotice({ drawDefinition, eventId: event?.eventId });

  const auditData = definedAttributes({
    drawId: drawDefinition?.drawId,
    action: stack,
    collectionId,
    structureId,
    matchUpId,
    eventId,
  });
  tieFormatTelemetry({ appliedPolicies, drawDefinition, auditData });

  return {
    tieFormat: prunedTieFormat,
    deletedMatchUpIds,
    targetMatchUps,
    ...SUCCESS,
  };
}

function getScopedMatchUps({ matchUpId, matchUp, structureId, structure, drawDefinition, event }): MatchUp[] {
  if (matchUpId && matchUp) return [matchUp];

  if (structureId && structure) {
    return (
      getAllStructureMatchUps({
        matchUpFilters: { matchUpTypes: [TEAM] },
        structure,
      })?.matchUps ?? []
    );
  }

  if (drawDefinition) {
    return (
      allDrawMatchUps({
        matchUpFilters: { matchUpTypes: [TEAM] },
        drawDefinition,
      })?.matchUps ?? []
    );
  }

  if (event) {
    return (
      allEventMatchUps({
        matchUpFilters: { matchUpTypes: [TEAM] },
        drawDefinition,
      })?.matchUps ?? []
    );
  }

  return [];
}

function clearCollectionScores({
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  collectionId,
  matchUpId,
  matchUp,
  event,
}) {
  const collectionMatchUps = matchUp.tieMatchUps?.filter((tieMatchUp) => tieMatchUp.collectionId === collectionId);
  let currentMatchUp = matchUp;
  for (const collectionMatchUp of collectionMatchUps ?? []) {
    let result: any = setMatchUpState({
      matchUpId: collectionMatchUp.matchUpId,
      tieMatchUpId: currentMatchUp?.matchUpId,
      winningSide: undefined,
      removeScore: true,
      tournamentRecord,
      appliedPolicies,
      drawDefinition,
      event,
    });
    if (result.error) return result;

    result = findDrawMatchUp({
      drawDefinition,
      matchUpId,
    });
    if (result.error) return result;
    currentMatchUp = result?.matchUp;
  }
  return { matchUp: currentMatchUp };
}

function processTargetMatchUp({
  deletedMatchUpIds,
  collectionId,
  tieFormat,
  stack,
  event,
  matchUp,
  tournamentRecord,
  drawDefinition,
}) {
  for (const side of matchUp?.sides ?? []) {
    side.lineUp = (side.lineUp ?? []).map((assignment) => ({
      participantId: assignment.participantId,
      collectionAssignments: (assignment?.collectionAssignments ?? []).filter(
        (collectionAssignment) => collectionAssignment.collectionId !== collectionId,
      ),
    }));
  }

  matchUp.tieMatchUps = (matchUp.tieMatchUps ?? []).filter((tieMatchUp) => {
    const deleteTarget = tieMatchUp.collectionId === collectionId;
    if (deleteTarget) deletedMatchUpIds.push(tieMatchUp.matchUpId);
    return !deleteTarget;
  });

  if (matchUp.tieFormat || matchUp.tieFormatId) {
    writeTieFormat({ target: matchUp, tieFormat: copyTieFormat(tieFormat), event });
  }

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    context: stack,
    matchUp,
  });
}

function updateTargetMatchUpScore({
  updateInProgressMatchUps,
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  matchUp,
  event,
}) {
  if (!updateInProgressMatchUps) return undefined;

  return updateTieMatchUpScore({
    matchUpId: matchUp.matchUpId,
    exitWhenNoValues: true,
    tournamentRecord,
    appliedPolicies,
    drawDefinition,
    event,
  });
}

function filterTargetMatchUps({
  updateInProgressMatchUps,
  tieFormatComparison,
  collectionId,
  tieFormat,
  matchUps,
}): MatchUp[] {
  return (matchUps ?? []).filter((matchUp) => {
    const collectionMatchUps = matchUp.tieMatchUps?.filter((tieMatchUp) => tieMatchUp.collectionId === collectionId);
    const collectionScore = collectionMatchUps?.some(checkScoreHasValue);

    if (updateInProgressMatchUps && !collectionScore) return true;
    if (matchUp.winningSide || matchUp.matchUpStatus === COMPLETED) return false;

    const tieFormatDifference =
      tieFormatComparison && matchUp.tieFormat
        ? compareTieFormats({
            descendant: matchUp.tieFormat,
            ancestor: tieFormat,
          })?.different
        : false;

    return (
      updateInProgressMatchUps ||
      (matchUp.matchUpStatus !== IN_PROGRESS && !checkScoreHasValue(matchUp) && !tieFormatDifference)
    );
  });
}
