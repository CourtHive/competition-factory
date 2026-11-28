import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { getTieFormat } from '@Query/hierarchical/tieFormats/getTieFormat';
import { nonTeamTieFormatTargetRefusal } from '@Validators/nonTeamTieFormat';
import { withEventChangeNotice } from '@Mutate/events/eventChangeNotice';
import { decorateResult } from '@Functions/global/decorateResult';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { collectionGroupUpdate } from './collectionGroupUpdate';

// constants
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import type { CollectionGroup, DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';

// A tieFormat written to the event, or to event.tieFormats (where a draw's, structure's or matchUp's
// shared tieFormat lives), modifies the event: announced with MODIFY_EVENT when it changed.
export function addCollectionGroup(params: Parameters<typeof addGroup>[0]) {
  // a tieFormat edit on an event or draw that is not TEAM is refused, before anything is written
  const targetRefusal = nonTeamTieFormatTargetRefusal(params);
  if (targetRefusal) return { ...targetRefusal, stack: ['addCollectionGroup'] } as ReturnType<typeof addGroup>;
  return withEventChangeNotice(params, () => addGroup(params));
}

type AddCollectionGroupArgs = {
  updateInProgressMatchUps?: boolean;
  tournamentRecord?: Tournament;
  groupDefinition: CollectionGroup;
  drawDefinition?: DrawDefinition;
  collectionIds: string[];
  tieFormatName?: string;
  structureId?: string;
  matchUpId?: string;
  matchUp?: MatchUp;
  eventId?: string;
  event?: Event;
};
function addGroup({
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
}: AddCollectionGroupArgs) {
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

  tieFormat.collectionGroups = [...(tieFormat.collectionGroups ?? []), groupDefinition];

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
  } as Parameters<typeof collectionGroupUpdate>[0]);
}
