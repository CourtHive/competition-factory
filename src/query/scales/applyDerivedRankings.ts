import type { RankingListEntry } from './generateRankingList';
import type { DerivedFilter } from '@Types/rankingTypes';

/**
 * Per-participant context the filter needs from the consumer.
 *
 * The factory does not own DOBs or aging-up state — those live in the
 * tournament records (for in-memory factory use) and in personService
 * (for the rankings pipeline). The caller resolves these and passes
 * them in as closures so this function stays pure.
 */
export interface ParticipantContext {
  /** Effective age at the given date; undefined if unknown. */
  ageAtDate?: (personId: string, asOfDate?: string) => number | undefined;

  /**
   * Whether the participant is "aging up" at the end of the current
   * classification period. Used by ČTS's rCŽ (reduced ranking) rule.
   */
  isAgingUpAtPeriodEnd?: (personId: string) => boolean;
}

type ApplyDerivedRankingsArgs = {
  /** A computed source ranking snapshot's entries. */
  entries: RankingListEntry[];

  /** Filter spec describing how to derive a sub-ranking from `entries`. */
  filter: DerivedFilter;

  /** Snapshot date — used for ageRange resolution against ageAtDate. */
  asOfDate?: string;

  /** Per-participant context resolved by the caller. */
  participantContext?: ParticipantContext;
};

/**
 * Apply a DerivedFilter to a source snapshot's entries to produce a
 * filtered snapshot. Ranks are renumbered 1..N over the filtered set.
 * Total points and counting/dropped results carry through unchanged —
 * the derived snapshot is a view, not a recomputation.
 *
 * Used by ČTS: the U16 ("ml. dorost") snapshot is the U18 ("dorost")
 * snapshot filtered to participants whose effective age is ≤16.
 */
export function applyDerivedRankings({
  entries,
  filter,
  asOfDate,
  participantContext,
}: ApplyDerivedRankingsArgs): RankingListEntry[] {
  const survivors = entries.filter((entry) => entryPassesFilter(entry, filter, asOfDate, participantContext));

  // Stable in source order (already ranked) — renumber 1..N.
  return survivors.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

function entryPassesFilter(
  entry: RankingListEntry,
  filter: DerivedFilter,
  asOfDate: string | undefined,
  participantContext: ParticipantContext | undefined,
): boolean {
  if (filter.ageRange) {
    if (!participantContext?.ageAtDate) {
      // Filter requires age data the caller didn't provide — drop conservatively.
      return false;
    }
    const age = participantContext.ageAtDate(entry.personId, asOfDate);
    if (age === undefined) return false;
    if (filter.ageRange.min !== undefined && age < filter.ageRange.min) return false;
    if (filter.ageRange.max !== undefined && age > filter.ageRange.max) return false;
  }

  if (filter.excludePlayersAgingUp) {
    if (!participantContext?.isAgingUpAtPeriodEnd) return true; // No data — pass through.
    if (participantContext.isAgingUpAtPeriodEnd(entry.personId)) return false;
  }

  // additionalScope is treated as a category match against the entry's
  // primary award. Without award introspection in the entry shape, we
  // pass through; the caller can pre-filter entries against an
  // additionalScope before calling if it matters.

  return true;
}
