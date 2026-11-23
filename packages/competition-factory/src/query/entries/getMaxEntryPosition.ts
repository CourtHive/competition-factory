import { ensureInt } from '@Tools/ensureInt';

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
