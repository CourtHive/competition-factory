import { MUTUALLY_EXCLUSIVE_TIME_MODIFIERS, NOT_BEFORE } from '@Constants/timeItemConstants';

/**
 * How strongly a schedule commits to a matchUp's written time.
 *
 * A `timeModifier` is not a note beside a `scheduledTime`; it is a statement
 * about what that time *means*. Reading the time while discarding the modifiers
 * reads half a sentence and then grades the half it read.
 *
 * ── The annotations are not one thing ──
 *
 * `MUTUALLY_EXCLUSIVE_TIME_MODIFIERS` — `TO_BE_ANNOUNCED`, `NEXT_AVAILABLE`,
 * `FOLLOWED_BY`, `AFTER_REST`, `RAIN_DELAY` — **clear `scheduledTime` when
 * written**, and writing a time clears them (`mutate/matchUps/schedule/scheduledTime`).
 * So in a record produced by this engine they never coexist with a time at all.
 *
 * `NOT_BEFORE` is deliberately absent from that list, and it is the one
 * annotation that can stand beside a live time. It makes that time MORE binding
 * rather than less: "not before 14:30" is a floor, forbidding an earlier start,
 * not a withdrawal of 14:30.
 *
 * ── Why a consumer needs the distinction ──
 *
 * Anything that grades a written time as a commitment — "this time cannot be
 * met" — is wrong twice if it ignores modifiers: it indicts a time the schedule
 * withdrew, and it treats a floor's later clearance as a broken promise when a
 * later floor is exactly what a floor permits.
 *
 * Hydration already suppresses an annotation once the matchUp has begun or
 * resolved, on the grounds that an annotation about *when a match may begin* is
 * misinformation once it has. So a modifier reaching a reader describes a
 * matchUp that has not started.
 */
export type TimeCommitment = 'firm' | 'floor' | 'none';

/**
 * What the schedule commits to for this matchUp.
 *
 * - `firm` — a stated start.
 * - `floor` — `NOT_BEFORE`: nothing may begin earlier; later is permitted.
 * - `none` — no time is stated, either because none is recorded or because an
 *   annotation withdraws the one that is.
 */
export function commitmentOf(schedule?: { scheduledTime?: string; timeModifiers?: string[] } | null): TimeCommitment {
  if (!schedule?.scheduledTime) return 'none';

  const modifiers = schedule.timeModifiers ?? [];
  if (modifiers.some((modifier) => MUTUALLY_EXCLUSIVE_TIME_MODIFIERS.includes(modifier))) return 'none';
  // Checked after the exclusive set: a record carrying both — which this engine
  // will not produce — reads as "no time stated" rather than as a floor, which
  // is the safer of the two readings.
  if (modifiers.includes(NOT_BEFORE)) return 'floor';
  return 'firm';
}
