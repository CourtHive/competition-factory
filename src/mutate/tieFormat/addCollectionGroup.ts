import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { getTieFormat } from '@Query/hierarchical/tieFormats/getTieFormat';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { collectionGroupUpdate } from './collectionGroupUpdate';

// constants
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';

export function addCollectionGroup({
  updateInProgressMatchUps = true,
  tournamentRecord,
  groupDefinition,
  drawDefinition,
  collectionIds,
  tieFormatName,
  structureId,
  matchUpId,
  matchUp,
  eventId,
  event,
}) {
  const stack = 'addCollectionGroup';
  if (!Array.isArray(collectionIds)) return decorateResult({ result: { error: MISSING_VALUE }, stack });

  let result = !matchUp
    ? getTieFormat({
        drawDefinition,
        structureId,
        matchUpId,
        eventId,
        event,
      })
    : undefined;
  if (result?.error) return decorateResult({ result, stack });

  const structure = result?.structure;
  matchUp = matchUp || result?.matchUp;
  const existingTieFormat = result?.tieFormat;
  const originalValueGoal = existingTieFormat?.winCriteria.valueGoal;
  const tieFormat = copyTieFormat(existingTieFormat);

  result = validateTieFormat({ tieFormat });
  if (result.error) return decorateResult({ result, stack });

  // if any of the collectionIds are already part of a different collectionGroup, throw an error
  for (const collectionDefinition of tieFormat.collectionDefinitions) {
    const { collectionId, collectionGroupNumber } = collectionDefinition;
    if (collectionGroupNumber && collectionIds.includes(collectionId))
      return decorateResult({
        info: 'collectionIds cannot be part of other collectionGroups',
        result: { error: INVALID_VALUES },
        stack,
      });
    // either matchUpCount * matchUpValue or collectionValue or collectionValueProfiles total
  }

  const maxGroupNumber = (tieFormat.collectionGroups ?? []).reduce(
    (max, group) => (group.groupNumber > max ? group.groupNumber : max),
    0,
  );
  const collectionGroupNumber = maxGroupNumber + 1;
  groupDefinition.groupNumber = collectionGroupNumber;

  // add collectionGroupNumber to all targeted collectionDefinitions
  tieFormat.collectionDefinitions = tieFormat.collectionDefinitions.map((collectionDefinition) => {
    if (collectionIds.includes(collectionDefinition.collectionId)) {
      return { ...collectionDefinition, collectionGroupNumber };
    } else {
      return collectionDefinition;
    }
  });

  tieFormat.collectionGroups = [...(tieFormat.collecitonGroups ?? []), groupDefinition];

  return collectionGroupUpdate({
    updateInProgressMatchUps,
    originalValueGoal,
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
}
