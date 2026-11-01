import { modifyCollectionDefinition } from '@Mutate/tieFormat/modifyCollectionDefinition';
import { removeCollectionDefinition } from '@Mutate/tieFormat/removeCollectionDefinition';
import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { addCollectionDefinition } from '@Mutate/tieFormat/addCollectionDefinition';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { getTieFormat } from '@Query/hierarchical/tieFormats/getTieFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { numericSortValue } from '@Tools/arrays';
import { xa } from '@Tools/extractAttributes';

// constants and types
import { DrawDefinition, Event, TieFormat, Tournament } from '@Types/tournamentTypes';
import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyTieFormatArgs = {
  considerations?: { collectionName?: boolean; collectionOrder?: boolean };
  updateInProgressMatchUps?: boolean;
  tieFormatComparison?: boolean;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  modifiedTieFormat: TieFormat;
  structureId?: string;
  matchUpId?: string;
  eventId?: string;
  uuids?: string[];
  event?: Event;
};

export function modifyTieFormat({
  updateInProgressMatchUps = false,
  tieFormatComparison,
  modifiedTieFormat,
  tournamentRecord,
  considerations,
  drawDefinition,
  structureId,
  matchUpId,
  eventId,
  uuids,
  event,
}: ModifyTieFormatArgs) {
  const stack = 'modifyTieFormat';

  if (!validateTieFormat({ tieFormat: modifiedTieFormat, enforceValues: true }).valid) {
    return decorateResult({
      result: { error: INVALID_TIE_FORMAT },
      info: 'falied validation',
      stack,
    });
  }

  const result = getTieFormat({
    drawDefinition,
    structureId,
    matchUpId,
    eventId,
    event,
  });
  if (result.error) return decorateResult({ result, stack });

  const { matchUp, tieFormat: existingTieFormat } = result;
  const tieFormat = copyTieFormat(existingTieFormat);

  const comparison = compareTieFormats({
    descendant: modifiedTieFormat,
    ancestor: tieFormat,
    considerations,
  });
  if (comparison.invalid) {
    return decorateResult({
      context: { invalid: comparison.invalid },
      result: { error: INVALID_TIE_FORMAT },
      stack,
    });
  }
  if (!comparison?.different) {
    return decorateResult({
      result: { ...SUCCESS },
      info: 'Nothing to do',
      stack,
    });
  }

  const existingCollectionIds = tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
  const updatedCollectionIds = modifiedTieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
  const removedCollectionIds = existingCollectionIds.filter(
    (collectionId) => !updatedCollectionIds.includes(collectionId),
  );

  const addedCollectionDefinitions: any[] = modifiedTieFormat.collectionDefinitions.filter(
    ({ collectionId }) => !existingCollectionIds.includes(collectionId),
  );

  const addedCollectionIds = addedCollectionDefinitions.map(xa('collectionId'));

  const modifications: any[] = [];
  let processedTieFormat;

  const tieFormatName = modifiedTieFormat.tieFormatName;
  for (const collectionDefinition of modifiedTieFormat.collectionDefinitions) {
    if (addedCollectionIds.includes(collectionDefinition.collectionId)) continue;

    const result = modifyCollectionDefinition({
      updateInProgressMatchUps,
      ...collectionDefinition,
      tournamentRecord,
      tieFormatName,
      drawDefinition,
      structureId,
      matchUpId,
      eventId,
      event,
    });
    if (result.modifications) modifications.push(...result.modifications);
    if (result.error) return decorateResult({ result, stack });
    if (result.tieFormat) processedTieFormat = result.tieFormat;
  }

  for (const collectionDefinition of addedCollectionDefinitions) {
    const result = addCollectionDefinition({
      updateInProgressMatchUps,
      collectionDefinition,
      tournamentRecord,
      drawDefinition,
      tieFormatName,
      structureId,
      matchUpId,
      matchUp,
      eventId,
      uuids,
      event,
    });
    if (result.error) return decorateResult({ result, stack });
    if (result.tieFormat) processedTieFormat = result.tieFormat;
  }

  for (const collectionId of removedCollectionIds) {
    const result = removeCollectionDefinition({
      updateInProgressMatchUps,
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
    });
    if (result.error) return decorateResult({ result, stack });
    if (result.tieFormat) processedTieFormat = result.tieFormat;
  }

  const changedTieFormatName = existingTieFormat?.tieFormatName !== tieFormatName;

  // if tieFormat has changed, force renaming of the tieFormat
  if (changedTieFormatName) {
    processedTieFormat.tieFormatName = tieFormatName;
    modifications.push({ tieFormatName });
  } else if (modifications.length || addedCollectionIds.length || removedCollectionIds.length) {
    delete processedTieFormat.tieFormatName;
    modifications.push('tieFormatName removed: modifications without new tieFormatName');
  }

  processedTieFormat.collectionDefinitions = processedTieFormat.collectionDefinitions
    .sort((a, b) => numericSortValue(a.collectionOrder) - numericSortValue(b.collectionOrder))
    .map((def, i) => ({ ...def, collectionOrder: i + 1 }));

  return {
    processedTieFormat: copyTieFormat(processedTieFormat),
    modifications,
    ...SUCCESS,
  };
}
