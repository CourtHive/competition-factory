import { pushGlobalLog } from '@Functions/global/globalLog';

// constants and types
import { MatchUp } from '@Types/tournamentTypes';
import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_VENUE,
  COURT_ANNOTATION,
  COURT_ORDER,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  TIME_MODIFIERS,
} from '@Constants/timeItemConstants';

/**
 * Placement + order-of-play attributes, as `timeItem.itemType` → first-class
 * `matchUp.schedule` attribute. This is the set that answers "does this matchUp
 * hold a place on somebody's schedule?", and the set released when an operator
 * says a BYE should give that place back.
 *
 * Deliberately EXCLUDES the actual-play timestamps (START_TIME / STOP_TIME /
 * RESUME_TIME / END_TIME): those record that something happened on a court and
 * are not ours to erase. A drawPosition cannot be byed while it is active
 * (`DRAW_POSITION_ACTIVE`), so in practice a BYE carries none of them.
 */
const SCHEDULING_ATTRIBUTES: Record<string, string> = {
  [ALLOCATE_COURTS]: 'allocatedCourts',
  [ASSIGN_COURT]: 'courtId',
  [ASSIGN_VENUE]: 'venueId',
  [COURT_ANNOTATION]: 'courtAnnotation',
  [COURT_ORDER]: 'courtOrder',
  [SCHEDULED_DATE]: 'scheduledDate',
  [SCHEDULED_TIME]: 'scheduledTime',
  [TIME_MODIFIERS]: 'timeModifiers',
};

const SCHEDULING_ITEM_TYPES = new Set(Object.keys(SCHEDULING_ATTRIBUTES));
const SCHEDULING_ATTRIBUTE_NAMES = Object.values(SCHEDULING_ATTRIBUTES);

/**
 * Whether a matchUp currently holds placement or order-of-play information.
 *
 * Used to decide whether assigning a BYE is an unambiguous action. If the matchUp
 * holds nothing, there is no operator work at stake and no question to ask.
 *
 * Checks BOTH surfaces: first-class `matchUp.schedule.*` (NATIVE writeMode, what
 * production runs) and legacy `matchUp.timeItems[]` (LEGACY writeMode).
 */
export function matchUpHoldsScheduling({ matchUp }: { matchUp?: MatchUp }): boolean {
  if (!matchUp) return false;

  const schedule = matchUp.schedule as Record<string, any> | undefined;
  if (schedule && SCHEDULING_ATTRIBUTE_NAMES.some((attribute) => schedule[attribute] !== undefined)) return true;

  return !!matchUp.timeItems?.some((timeItem) => timeItem?.itemType && SCHEDULING_ITEM_TYPES.has(timeItem.itemType));
}

/**
 * Release the placement a matchUp is holding, because an operator has explicitly
 * said a BYE should give it up (`preserveScheduling: false`).
 *
 * This is NOT a default. A tournament director may schedule an entire event and
 * then swap participants around, temporarily or permanently placing byes; wiping
 * the surrounding plan to keep a conflict detector quiet would destroy careful
 * work. A BYE that keeps its slot is rendered in the schedule grid and flagged
 * `CONFLICT_BYE_SCHEDULED` (WARNING) instead — visible, and the operator's call.
 *
 * Mutates `matchUp` in place and reports whether anything was released, so the
 * caller can fold it into the `modifyMatchUpNotice` it already emits rather than
 * issuing a second one. Intentionally does NOT consult the schedule lock: a lock
 * pins a placement against scheduling MOVES, and this is an explicit release.
 *
 * @param matchUp - the (no-context) matchUp being set to BYE
 * @returns true when a placement or order-of-play attribute was released
 */
export function releaseByeScheduling({ matchUp }: { matchUp?: MatchUp }): boolean {
  if (!matchUp) return false;

  let released = false;

  const timeItems = matchUp.timeItems;
  if (timeItems?.length) {
    const retained = timeItems.filter(
      (timeItem) => !(timeItem?.itemType && SCHEDULING_ITEM_TYPES.has(timeItem.itemType)),
    );
    if (retained.length !== timeItems.length) {
      matchUp.timeItems = retained;
      released = true;
    }
  }

  const schedule = matchUp.schedule as Record<string, any> | undefined;
  if (schedule) {
    for (const attribute of SCHEDULING_ATTRIBUTE_NAMES) {
      if (schedule[attribute] !== undefined) {
        delete schedule[attribute];
        released = true;
      }
    }
    if (!Object.keys(schedule).length) delete matchUp.schedule;
  }

  if (released) {
    pushGlobalLog({
      method: 'releaseByeScheduling',
      color: 'brightyellow',
      matchUpId: matchUp.matchUpId,
    });
  }

  return released;
}
