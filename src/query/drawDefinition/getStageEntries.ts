import { getFlightProfile } from '@Query/event/getFlightProfile';

// constants and types
import { DrawDefinition, Entry, EntryStatusUnion, Event } from '@Types/tournamentTypes';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';

type GetStageEntriesArgs = {
  entryStatuses?: EntryStatusUnion[];
  drawDefinition: DrawDefinition;
  selected?: boolean;
  drawId?: string;
  stage?: string;
  event: Event;
};
export function getStageEntries({
  selected = true,
  drawDefinition,
  entryStatuses,
  drawId,
  event,
  stage,
}: GetStageEntriesArgs) {
  let entries: Entry[] = event.entries ?? [];

  if (drawId) {
    const { flightProfile } = getFlightProfile({ event });
    const flight = flightProfile?.flights?.find((flight) => flight.drawId === drawId);
    if (flight) {
      entries = flight.drawEntries;
    } else if (drawDefinition.entries) {
      entries = drawDefinition?.entries;
    }
  }

  const stageEntries = entries.filter(
    (entry) =>
      (!entryStatuses?.length || !entry.entryStatus || entryStatuses.includes(entry.entryStatus)) &&
      (!stage || !entry.entryStage || entry.entryStage === stage) &&
      (!selected || (entry.entryStatus && STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus))),
  );
  return { entries, stageEntries };
}
