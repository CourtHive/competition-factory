import { entryStatusGroupOf } from '@Query/entries/entryPositionGroup';
import { MAIN } from '@Constants/drawDefinitionConstants';

/**
 * Renumbers entryPositions 1..n within each group: one list per entryStage for all accepted statuses
 * (STRUCTURE_SELECTED_STATUSES), and one per stage for each other status. See entryPositionGroup.
 * @param {object[]} entries - array of entry objects
 * @returns entries - with updated entryPosition values
 */
export function refreshEntryPositions(params) {
  const stagedEntries = (params?.entries ?? []).filter(Boolean).reduce((stages, entry) => {
    const { entryStage, entryStatus } = entry;
    const entryHash = `_${entryStage || MAIN}${entryStatusGroupOf(entryStatus)}`;
    if (!stages[entryHash]) stages[entryHash] = [];
    stages[entryHash].push(entry);
    return stages;
  }, {});

  const validEntryPosition = (entryPosition) => (Number.isNaN(Number(entryPosition)) ? Infinity : entryPosition);

  return Object.keys(stagedEntries).flatMap((entryHash) => {
    return stagedEntries[entryHash]
      .sort((a, b) => validEntryPosition(a.entryPosition) - validEntryPosition(b.entryPosition))
      .map((entry, index) => {
        const entryPosition = index + 1;
        return { ...entry, entryPosition };
      });
  });
}
