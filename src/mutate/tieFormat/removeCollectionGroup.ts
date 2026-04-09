import { collectionGroupUpdate } from '@Mutate/tieFormat/collectionGroupUpdate';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { getTieFormat } from '@Query/hierarchical/tieFormats/getTieFormat';
import { tieFormatTelemetry } from '@Mutate/tieFormat/tieFormatTelemetry';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';

type RemoveCollectionGroupArgs = {
  updateInProgressMatchUps?: boolean;
  collectionGroupNumber: number;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  tieFormatName?: string;
  structureId: string;
  matchUpId: string;
  matchUp?: MatchUp;
  eventId?: string;
  event?: Event;
};
export function removeCollectionGroup({
  updateInProgressMatchUps = true,
  collectionGroupNumber,
  tournamentRecord,
  drawDefinition,
  tieFormatName,
  structureId,
  matchUpId,
  matchUp,
  eventId,
  event,
}: RemoveCollectionGroupArgs) {
  if (!collectionGroupNumber) return { error: MISSING_VALUE };
  if (Number.isNaN(Number(collectionGroupNumber))) return { error: INVALID_VALUES };
  const stack = 'removeCollectionGroup';

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
  const originalValueGoal = existingTieFormat?.winCriteria.valueGoal;
  const wasAggregateValue = existingTieFormat?.winCriteria.aggregateValue;
  const tieFormat = copyTieFormat(existingTieFormat);

  result = validateTieFormat({ tieFormat });
  if (result.error) return decorateResult({ result, stack });

  const modifiedCollectionIds: string[] = [];
  // remove the collectionGroup and all references to it in other collectionDefinitions
  tieFormat.collectionDefinitions = (tieFormat.collectionDefinitions ?? []).map((collectionDefinition) => {
    const { collectionGroupNumber: groupNumber, ...rest } = collectionDefinition;
    if (groupNumber === collectionGroupNumber) {
      modifiedCollectionIds.push(collectionDefinition.collectionId);
      return rest;
    } else {
      return collectionDefinition;
    }
  });
  tieFormat.collectionGroups = (tieFormat.collectionGroups ?? []).filter(
    ({ groupNumber }) => groupNumber !== collectionGroupNumber,
  );

  result = collectionGroupUpdate({
    updateInProgressMatchUps,
    originalValueGoal,
    wasAggregateValue,
    tournamentRecord,
    drawDefinition,
    tieFormatName,
    structureId,
    structure,
    tieFormat,
    matchUpId,
    matchUp,
    eventId,
    event,
  });

  if (!result.error) {
    const { appliedPolicies } = getAppliedPolicies({ tournamentRecord });
    const auditData = definedAttributes({
      drawId: drawDefinition?.drawId,
      collectionGroupNumber,
      action: stack,
      structureId,
      matchUpId,
      eventId,
    });
    tieFormatTelemetry({ appliedPolicies, drawDefinition, auditData });
  }

  return decorateResult({
    result: { ...result, modifiedCollectionIds },
    stack,
  });
}
