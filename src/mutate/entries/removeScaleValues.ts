import { removeParticipantsScaleItems } from '../participants/scaleItems/removeScaleItems';
import { decorateResult } from '@Functions/global/decorateResult';
import { getParticipantId } from '@Functions/global/extractors';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { mustBeAnArray } from '@Tools/mustBeAnArray';

// constants
import { INVALID_VALUES, MISSING_EVENT } from '@Constants/errorConditionConstants';

export function removeScaleValues({
  tournamentRecord,
  scaleAttributes,
  drawDefinition,
  entryStatuses,
  drawId,
  event,
  stage,
}) {
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

  const stageEntries = (entries || []).filter(
    (entry) =>
      (!stage || !entry.entryStage || entry.entryStage === stage) &&
      (!entryStatuses || entryStatuses.includes(entry.entryStatus)),
  );

  const participantIds = stageEntries.map(getParticipantId);

  return removeParticipantsScaleItems({
    tournamentRecord,
    scaleAttributes,
    participantIds,
  });
}
