import { ensureInt } from '@Tools/ensureInt';

// types
import type { Entry, EntryStatusUnion, StageTypeUnion } from '@Types/tournamentTypes';

type GetMaxEntryPositionArgs = {
  entries?: Pick<Entry, 'entryPosition' | 'entryStage' | 'entryStatus'>[];
  entryStatus?: EntryStatusUnion;
  stage?: StageTypeUnion;
};

/** The highest `entryPosition` among the entries of `stage` and `entryStatus` (either omitted matches any); 0 when none. */
export function getMaxEntryPosition(params: GetMaxEntryPositionArgs): number;
// eslint-disable-next-line no-redeclare -- overload implementation
export function getMaxEntryPosition(params) {
  const { entries = [], entryStatus, stage } = params;
  return Math.max(
    ...entries
      .filter(
        (entry) =>
          (!stage || stage === entry.entryStage) &&
          (!entryStatus || entry.entryStatus === entryStatus) &&
          !isNaN(entry.entryPosition),
      )
      .map(({ entryPosition }) => ensureInt(entryPosition || 0)),
    0,
  );
}
