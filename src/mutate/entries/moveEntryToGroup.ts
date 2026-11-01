import { MAIN } from '@Constants/drawDefinitionConstants';

// types
import type { Entry, EntryStatusUnion, StageTypeUnion } from '@Types/tournamentTypes';

/**
 * entryPositions are numbered within a group: the entries sharing an entryStage (MAIN when absent) and an entryStatus,
 * as refreshEntryPositions numbers them.
 */
export const entryStageOf = (entry: Entry) => entry.entryStage ?? MAIN;

// a usable entryPosition, or undefined when the entry has none
export function entryPositionOf(entry: Entry): number | undefined {
  const value: unknown = entry.entryPosition;
  if (value === undefined || value === null || value === '') return undefined;
  const position = Number(value);
  return Number.isFinite(position) ? position : undefined;
}

type MoveEntryToGroupArgs = {
  entryStatus?: EntryStatusUnion;
  entryStage?: StageTypeUnion;
  entries: Entry[];
  entry: Entry;
};

/**
 * Moves `entry` (an element of `entries`) to the group of `entryStatus` and `entryStage`; either defaults to the
 * entry's own. An entry that stays in its group keeps its position. One that changes group:
 * - leaves its old group, whose entries behind it close up;
 * - takes the next position of its new group (`max + 1` of the positioned entries there), so entries moved one after
 *   another take distinct positions in that order;
 * - is left without a position when no entry of its new group has one: a position would sort it ahead of them.
 */
export function moveEntryToGroup({ entries, entry, entryStatus, entryStage }: MoveEntryToGroupArgs) {
  const fromStage = entryStageOf(entry);
  const fromStatus = entry.entryStatus;
  const toStage = entryStage ?? fromStage;
  const toStatus = entryStatus ?? fromStatus;

  if (entryStatus) entry.entryStatus = entryStatus;
  if (entryStage) entry.entryStage = entryStage;
  if (fromStage === toStage && fromStatus === toStatus) return;

  const inGroup = (other: Entry, stage: string, status?: EntryStatusUnion) =>
    other !== entry && other.entryStatus === status && entryStageOf(other) === stage;

  const fromPosition = entryPositionOf(entry);
  if (fromPosition !== undefined) {
    for (const other of entries) {
      const position = entryPositionOf(other);
      if (inGroup(other, fromStage, fromStatus) && position !== undefined && position > fromPosition) {
        other.entryPosition = position - 1;
      }
    }
  }

  const groupPositions = entries
    .filter((other) => inGroup(other, toStage, toStatus))
    .map(entryPositionOf)
    .filter((position): position is number => position !== undefined);

  if (groupPositions.length) {
    entry.entryPosition = Math.max(...groupPositions) + 1;
  } else {
    delete entry.entryPosition;
  }
}
