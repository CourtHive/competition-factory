/**
 * Recovery keyed to how long the previous matchUp *actually ran*.
 *
 * Some sanctioning bodies scale rest by elapsed duration rather than by format —
 * the long-standing USTA table gives 30 minutes after a match under an hour, an
 * hour after one to one-and-a-half, and ninety minutes beyond that. Expressed as
 * an ordered band list on a recovery-times entry:
 *
 *     byPlayedMinutes: [{ upTo: 60, minutes: 30 }, { upTo: 90, minutes: 60 }, { minutes: 90 }]
 *
 * ── Why this is opt-in on BOTH sides ──
 *
 * It returns `undefined` unless the policy authors `byPlayedMinutes` AND the
 * caller supplies a `playedMinutes` it actually measured. Neither half is
 * incidental:
 *
 * - Applied to an *estimated* duration the banding is circular. The estimate is
 *   `averageMinutes`, drawn from the very policy being consulted, so the band
 *   would be selected by the number the policy already predicted.
 * - No scheduler call site supplies `playedMinutes`, and none can: recovery is
 *   resolved once per matchUpFormat cohort and fanned out to every matchUp in it
 *   (`getScheduledRoundsDetails.ts:137-167`), one level coarser than the
 *   per-instance quantity a band needs. Scheduling therefore stays bit-identical
 *   by construction rather than behind a feature flag.
 *
 * The report layer is the intended consumer, where every duration is
 * retrospective and its provenance is known per row.
 */

type Band = { upTo?: number; minutes?: number };

export function getBandedRecoveryMinutes({
  byPlayedMinutes,
  playedMinutes,
}: {
  byPlayedMinutes?: Band[];
  playedMinutes?: number;
}): number | undefined {
  if (!Array.isArray(byPlayedMinutes) || !byPlayedMinutes.length) return undefined;
  if (typeof playedMinutes !== 'number' || !Number.isFinite(playedMinutes) || playedMinutes < 0) return undefined;

  // Ordered ascending so the table may be authored in any order; the catch-all
  // (no `upTo`) always sorts last. Copied rather than sorted in place —
  // `findCategoryTiming` already mutates policy arrays and that is not a habit
  // worth spreading to authored fixtures.
  const bands = [...byPlayedMinutes].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));

  for (const band of bands) {
    if (typeof band.minutes !== 'number') continue;
    if (band.upTo === undefined) return band.minutes;
    if (playedMinutes <= band.upTo) return band.minutes;
  }

  return undefined;
}
