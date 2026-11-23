import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

// types
import type { Entry, EntryStatusUnion } from '@Types/tournamentTypes';

/**
 * entryPositions are numbered within a group: one list per entryStage (MAIN when absent) for all accepted statuses
 * (STRUCTURE_SELECTED_STATUSES), and one list per stage for each other status (ALTERNATE, WITHDRAWN, ...).
 */
export const ACCEPTED_ENTRY_GROUP = 'ACCEPTED';

export const entryStageOf = (entry: Entry) => entry.entryStage ?? MAIN;

// the list an entryStatus is numbered in: every accepted status shares one
export const entryStatusGroupOf = (entryStatus?: EntryStatusUnion | string): string =>
  entryStatus && STRUCTURE_SELECTED_STATUSES.includes(entryStatus as EntryStatusUnion)
    ? ACCEPTED_ENTRY_GROUP
    : (entryStatus ?? '');

// a usable entryPosition, or undefined when the entry has none
export function entryPositionOf(entry: Entry): number | undefined {
  const value: unknown = entry.entryPosition;
  if (value === undefined || value === null || value === '') return undefined;
  const position = Number(value);
  return Number.isFinite(position) ? position : undefined;
}
