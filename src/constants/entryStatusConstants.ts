import {
  ALTERNATE,
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  FEED_IN,
  JUNIOR_EXEMPT,
  LUCKY_LOSER,
  ORGANISER_ACCEPTANCE,
  QUALIFIER,
  REGISTERED,
  SPECIAL_EXEMPT,
  UNGROUPED,
  UNPAIRED,
  WILDCARD,
  WITHDRAWN,
} from './entryStatusValues';
import type { EntryStatusUnion } from '@Types/tournamentTypes';

// primitive entry-status consts are generated from EntryStatusEnum (see
// entryStatusValues.ts); the semantic groupings below are hand-authored.
export * from './entryStatusValues';

export const EQUIVALENT_ACCEPTANCE_STATUSES: EntryStatusUnion[] = [
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  JUNIOR_EXEMPT,
  ORGANISER_ACCEPTANCE,
  SPECIAL_EXEMPT,
];
export const DRAW_SPECIFIC_STATUSES: EntryStatusUnion[] = [FEED_IN, LUCKY_LOSER, QUALIFIER];

export const DIRECT_ENTRY_STATUSES: EntryStatusUnion[] = [
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  FEED_IN,
  JUNIOR_EXEMPT,
  ORGANISER_ACCEPTANCE,
  SPECIAL_EXEMPT,
  WILDCARD,
];

export const STRUCTURE_SELECTED_STATUSES: EntryStatusUnion[] = [
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  JUNIOR_EXEMPT,
  LUCKY_LOSER,
  QUALIFIER,
  ORGANISER_ACCEPTANCE,
  SPECIAL_EXEMPT,
  WILDCARD,
];

export const VALID_ENTRY_STATUSES: EntryStatusUnion[] = [
  ALTERNATE,
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  FEED_IN,
  JUNIOR_EXEMPT,
  LUCKY_LOSER,
  ORGANISER_ACCEPTANCE,
  QUALIFIER,
  REGISTERED,
  SPECIAL_EXEMPT,
  UNGROUPED,
  UNPAIRED,
  WILDCARD,
  WITHDRAWN,
];

/**
 * Explicitly named so the emitted `.d.ts` references `EntryStatusUnion[]` by
 * alias instead of inlining the expanded literal union.
 *
 * `EntryStatusUnion` is `` `${EntryStatusEnum}` `` — a template-literal type,
 * which TypeScript resolves to a union whose member ORDER is not stable across
 * builds. Inlined into the `as const` aggregate below, that made
 * `dist/tods-competition-factory.d.ts` differ from build to build for exactly
 * these five groupings: ten lines of churn in every release diff, and enough to
 * defeat any byte-comparison of the published types. A plain-union alias
 * (`PointComponent`) already printed by name in the same position, which is
 * what identified the fix.
 */
type EntryStatusGroups = {
  readonly DIRECT_ENTRY_STATUSES: EntryStatusUnion[];
  readonly DRAW_SPECIFIC_STATUSES: EntryStatusUnion[];
  readonly EQUIVALENT_ACCEPTANCE_STATUSES: EntryStatusUnion[];
  readonly STRUCTURE_SELECTED_STATUSES: EntryStatusUnion[];
  readonly VALID_ENTRY_STATUSES: EntryStatusUnion[];
};

const entryStatusGroups: EntryStatusGroups = {
  DIRECT_ENTRY_STATUSES,
  DRAW_SPECIFIC_STATUSES,
  EQUIVALENT_ACCEPTANCE_STATUSES,
  STRUCTURE_SELECTED_STATUSES,
  VALID_ENTRY_STATUSES,
};

export const entryStatusConstants = {
  ALTERNATE,
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  FEED_IN,
  JUNIOR_EXEMPT,
  LUCKY_LOSER,
  ORGANISER_ACCEPTANCE,
  QUALIFIER,
  REGISTERED,
  SPECIAL_EXEMPT,
  UNGROUPED,
  UNPAIRED,
  WILDCARD,
  WITHDRAWN,
  ...entryStatusGroups,
} as const;
