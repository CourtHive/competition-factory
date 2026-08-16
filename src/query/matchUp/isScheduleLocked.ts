import { isObject } from '@Tools/objects';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ScheduleLockAttribute } from '@Types/tournamentTypes';
import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_VENUE,
  COURT_ORDER,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
} from '@Constants/timeItemConstants';

/**
 * Placement attributes a schedule lock guards.
 *
 * `startTime` / `stopTime` / `resumeTime` / `endTime` are deliberately absent:
 * they record actual play, not placement, and a locked matchUp must still be
 * startable, suspendable and completable. `courtAnnotation`, `timeModifiers`
 * and the official/scorekeeper/timekeeper assignments are annotations on a
 * placement rather than the placement itself, so they stay editable too.
 */
export const SCHEDULE_LOCK_ATTRIBUTES: ScheduleLockAttribute[] = [
  'allocatedCourts',
  'scheduledDate',
  'scheduledTime',
  'courtOrder',
  'courtId',
  'venueId',
];

// Write-side spelling → stored attribute. `addMatchUpScheduleItems` accepts
// `schedule.courtIds` for what is stored as `schedule.allocatedCourts`.
const REQUEST_KEY_TO_ATTRIBUTE: Record<string, ScheduleLockAttribute> = {
  allocatedCourts: 'allocatedCourts',
  scheduledDate: 'scheduledDate',
  scheduledTime: 'scheduledTime',
  courtOrder: 'courtOrder',
  courtIds: 'allocatedCourts',
  courtId: 'courtId',
  venueId: 'venueId',
};

// LEGACY / DUAL records keep placement in `timeItems[]` rather than first-class
// `schedule.*`. The predicate reads BOTH surfaces so a lock behaves identically
// in every schemaWriteMode — a first-class-only read would make locks silently
// inert in LEGACY, which is the exact divergence that made unscheduling a no-op
// in NATIVE before `clearScheduledMatchUps` was taught both surfaces.
const ATTRIBUTE_ITEM_TYPE: Record<ScheduleLockAttribute, string> = {
  allocatedCourts: ALLOCATE_COURTS,
  scheduledDate: SCHEDULED_DATE,
  scheduledTime: SCHEDULED_TIME,
  courtOrder: COURT_ORDER,
  courtId: ASSIGN_COURT,
  venueId: ASSIGN_VENUE,
};

const COMPLETED_STATUSES = new Set<string>(completedMatchUpStatuses);

const isEmpty = (value: any): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

/** Current placement value, first-class preferred, legacy timeItem as fallback. */
function currentValue(matchUp: any, attribute: ScheduleLockAttribute): any {
  const firstClass = matchUp?.schedule?.[attribute];
  if (!isEmpty(firstClass)) return firstClass;

  const itemType = ATTRIBUTE_ITEM_TYPE[attribute];
  const timeItems = (matchUp?.timeItems ?? []).filter((timeItem) => timeItem?.itemType === itemType);
  return timeItems.at(-1)?.itemValue;
}

/**
 * Would writing `requested` over `current` actually move the placement?
 * Clearing an already-absent attribute is a no-op, and `3` / `'3'` are the same
 * court order — neither should trip a lock.
 */
function equivalent(requested: any, current: any): boolean {
  if (isEmpty(requested) && isEmpty(current)) return true;
  if (isEmpty(requested) || isEmpty(current)) return false;
  if (Array.isArray(requested) || Array.isArray(current)) return JSON.stringify(requested) === JSON.stringify(current);
  return String(requested) === String(current);
}

/**
 * Is this matchUp's placement pinned by a director?
 *
 * Two conditions make an existing lock **inert** rather than removing it —
 * nothing is ever unwritten:
 *
 *  1. The matchUp has reached a completed status. Completed-status protection
 *     already keeps bulk scheduling away, so the lock has nothing left to do.
 *     This is the whole of the "release on completion" behaviour.
 *  2. There is no placement to protect. A matchUp that has been unscheduled
 *     (or was never placed) must stay freely schedulable — otherwise a lock
 *     left behind by an overridden clear would silently make the matchUp
 *     invisible to every bulk scheduling path, with no symptom to trace.
 *
 * Pass `attributes` to ask about specific placement fields; a lock with no
 * `attributes` of its own pins the entire placement.
 */
export function isScheduleLocked({
  attributes,
  matchUp,
}: {
  attributes?: ScheduleLockAttribute[];
  matchUp?: any;
}): boolean {
  const lock = matchUp?.schedule?.lock;
  if (!isObject(lock)) return false;
  if (matchUp?.matchUpStatus && COMPLETED_STATUSES.has(matchUp.matchUpStatus)) return false;
  if (SCHEDULE_LOCK_ATTRIBUTES.every((attribute) => isEmpty(currentValue(matchUp, attribute)))) return false;
  if (!attributes?.length) return true;

  const lockedAttributes = lock.attributes;
  if (!Array.isArray(lockedAttributes) || !lockedAttributes.length) return true;

  const lockedSet = new Set<string>(lockedAttributes);
  return attributes.some((attribute) => lockedSet.has(attribute));
}

/**
 * Which locked placement attributes a requested `schedule` write would change.
 * Empty ⇒ the write is permitted: either nothing is locked, or the call only
 * touches unlocked/actual-play attributes, or it rewrites the same values.
 */
export function scheduleLockConflicts({
  matchUp,
  schedule,
}: {
  matchUp?: any;
  schedule?: any;
}): ScheduleLockAttribute[] {
  if (!isObject(schedule) || !isScheduleLocked({ matchUp })) return [];

  const conflicts = new Set<ScheduleLockAttribute>();

  for (const key of Object.keys(schedule)) {
    const attribute = REQUEST_KEY_TO_ATTRIBUTE[key];
    if (!attribute || !isScheduleLocked({ matchUp, attributes: [attribute] })) continue;
    if (equivalent(schedule[key], currentValue(matchUp, attribute))) continue;
    conflicts.add(attribute);
  }

  return [...conflicts];
}
