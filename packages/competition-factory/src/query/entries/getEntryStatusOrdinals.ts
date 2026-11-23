import { entryPositionOf, entryStageOf } from '@Query/entries/entryPositionGroup';

// types
import type { Entry, EntryStatusUnion, StageTypeUnion } from '@Types/tournamentTypes';

export type EntryStatusOrdinal = {
  entryStatus?: EntryStatusUnion;
  entryPosition?: number;
  entryStage: StageTypeUnion;
  statusOrdinal: number;
  participantId: string;
};

type GetEntryStatusOrdinalsArgs = {
  entryStatus?: EntryStatusUnion;
  stage?: StageTypeUnion;
  entries: Entry[];
};

/**
 * Each entry's place among the entries of its own stage and entryStatus (e.g. WILDCARD #1, #2), derived from the one
 * entryPosition list in which all accepted statuses are numbered together. Within each stage and status the entries
 * are ordered by entryPosition, those without a position after them in array order, and numbered 1..n. Nothing is
 * stored: `statusOrdinal` is read from the entries as they are. `stage` (an entry without entryStage is MAIN) and
 * `entryStatus` narrow the result.
 */
export function getEntryStatusOrdinals({ entries, stage, entryStatus }: GetEntryStatusOrdinalsArgs): {
  statusOrdinals: EntryStatusOrdinal[];
} {
  const groups = new Map<string, Entry[]>();
  for (const entry of (Array.isArray(entries) ? entries : []).filter(Boolean)) {
    if (stage && entryStageOf(entry) !== stage) continue;
    if (entryStatus && entry.entryStatus !== entryStatus) continue;
    const key = `${entryStageOf(entry)}|${entry.entryStatus ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const order = (entry: Entry) => entryPositionOf(entry) ?? Infinity;
  const statusOrdinals = [...groups.values()].flatMap((group) =>
    [...group]
      .sort((a, b) => order(a) - order(b)) // stable: unpositioned entries keep their array order
      .map((entry, index) => ({
        entryPosition: entryPositionOf(entry),
        entryStatus: entry.entryStatus,
        participantId: entry.participantId,
        entryStage: entryStageOf(entry),
        statusOrdinal: index + 1,
      })),
  );

  return { statusOrdinals };
}
