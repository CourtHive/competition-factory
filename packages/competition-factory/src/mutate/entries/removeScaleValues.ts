import { removeParticipantsScaleItems } from '@Mutate/participants/scaleItems/removeScaleItems';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getParticipantId } from '@Functions/global/extractors';
import { mustBeAnArray } from '@Tools/mustBeAnArray';

// constants
import { INVALID_VALUES, MISSING_EVENT } from '@Constants/errorConditionConstants';
import type { DrawDefinition, EntryStatusUnion, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import type { ScaleAttributes } from '@Types/factoryTypes';

type RemoveScaleValuesArgs = {
  tournamentRecord: Tournament;
  scaleAttributes: ScaleAttributes;
  drawDefinition?: DrawDefinition;
  entryStatuses?: EntryStatusUnion[];
  drawId?: string;
  event: Event;
  stage?: StageTypeUnion;
};
export function removeScaleValues({
  tournamentRecord,
  scaleAttributes,
  drawDefinition,
  entryStatuses,
  drawId,
  event,
  stage,
}: RemoveScaleValuesArgs) {
  if (!event) return { error: MISSING_EVENT };
  if (entryStatuses && !Array.isArray(entryStatuses))
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: mustBeAnArray('entryStatus'),
      stack: 'removeScaleValues',
    });

  let entries = event.entries;

  if (drawId) {
    const { flightProfile } = getFlightProfile({ event });
    const flight = flightProfile?.flights?.find((flight) => flight.drawId === drawId);
    if (flight) {
      entries = flight.drawEntries;
    } else {
      entries = drawDefinition?.entries;
    }
  }

  const stageEntries = (entries ?? []).filter(
    (entry) =>
      (!stage || !entry.entryStage || entry.entryStage === stage) &&
      (!entryStatuses || entryStatuses.includes(entry.entryStatus!)),
  );

  const participantIds = stageEntries.map(getParticipantId);

  return removeParticipantsScaleItems({
    tournamentRecord,
    scaleAttributes,
    participantIds,
  });
}
