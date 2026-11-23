import { eligibleEntryStage } from '@Query/drawDefinition/positionActions/getValidAlternatesAction';
import { getParticipantId } from '@Functions/global/extractors';

// constants
import { ALTERNATE } from '@Constants/entryStatusConstants';

export function getEventAlternateParticipantIds({ eventEntries, structure }) {
  const eligibleAlternate = (entry) => entry.entryStatus === ALTERNATE && eligibleEntryStage({ structure, entry });
  const entryPositionSort = (a, b) => (a.entryPosition || Infinity) - (b.entryPosition || Infinity);

  return eventEntries.filter(eligibleAlternate).sort(entryPositionSort).map(getParticipantId);
}
