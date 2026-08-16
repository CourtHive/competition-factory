import { SCHEDULE_LOCK_ATTRIBUTES } from '@Query/matchUp/isScheduleLocked';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isObject } from '@Tools/objects';

// constants and types
import { DrawDefinition, Event, ScheduleLock, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';

type SetMatchUpScheduleLockArgs = {
  // the lock to apply; null or undefined removes an existing lock
  lock?: ScheduleLock | null;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  disableNotice?: boolean;
  matchUpId: string;
  event?: Event;
};

const LOCKABLE_ATTRIBUTES = new Set<string>(SCHEDULE_LOCK_ATTRIBUTES);

/**
 * Set or clear `matchUp.schedule.lock` — a director's declaration that this
 * placement is deliberate and must not be moved by bulk or automated
 * scheduling. The marquee match promised centre court at 19:00 survives a
 * Clear, a re-schedule, or a scenario apply of the rest of the day.
 *
 * Semantics:
 *  - Pass a {@link ScheduleLock} object to lock. `{}` pins the whole placement;
 *    `{ attributes: [...] }` pins only those placement fields.
 *  - Pass `null` or `undefined` to unlock (explicit removal).
 *  - Subsequent calls overwrite the prior lock.
 *  - `lockedAt` / `lockedBy` / `reason` are caller-supplied metadata — the
 *    factory never stamps wall-clock (the `calledAt` / ScheduleScenario idiom).
 *  - The lock guards PLACEMENT only: `startTime`, `stopTime`, `resumeTime` and
 *    `endTime` stay writable so a locked matchUp can still be played.
 *  - It becomes inert once the matchUp reaches a completed status — see
 *    `isScheduleLocked`. Nothing is unwritten on completion.
 *  - Locking a matchUp that has no placement is permitted but inert: a lock
 *    guards a placement, and an unscheduled matchUp has none. It takes effect
 *    as soon as the matchUp is placed.
 *  - Unrelated to `tournamentRecord.mutationLocks`, which gate whole methods at
 *    tournament grain.
 *
 * This is a CODES first-class attribute — no legacy timeItem mirror, no
 * LEGACY/DUAL/NATIVE branching.
 */
export function setMatchUpScheduleLock(params: SetMatchUpScheduleLockArgs) {
  const stack = 'setMatchUpScheduleLock';
  const { tournamentRecord, drawDefinition, disableNotice, matchUpId, event, lock } = params;

  if (!drawDefinition) return decorateResult({ result: { error: MISSING_DRAW_DEFINITION }, stack });
  if (!matchUpId) return decorateResult({ result: { error: MISSING_MATCHUP_ID }, stack });

  const removing = lock === undefined || lock === null;

  if (!removing) {
    if (!isObject(lock)) {
      return decorateResult({ result: { error: INVALID_VALUES }, stack, info: 'lock must be an object' });
    }
    const { attributes } = lock;
    if (attributes !== undefined) {
      const valid = Array.isArray(attributes) && attributes.every((attribute) => LOCKABLE_ATTRIBUTES.has(attribute));
      if (!valid) {
        return decorateResult({
          info: `lock.attributes must be an array of: ${SCHEDULE_LOCK_ATTRIBUTES.join(', ')}`,
          result: { error: INVALID_VALUES },
          stack,
        });
      }
    }
  }

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return decorateResult({ result: { error: MATCHUP_NOT_FOUND }, stack });

  if (removing) {
    if (matchUp.schedule) delete matchUp.schedule.lock;
  } else {
    if (!matchUp.schedule) matchUp.schedule = {};
    matchUp.schedule.lock = lock as ScheduleLock;
  }

  if (!disableNotice) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  }

  return { ...SUCCESS };
}
