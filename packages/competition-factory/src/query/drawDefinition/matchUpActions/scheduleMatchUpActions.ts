import { isAvailableAction, MatchUpAction } from '@Query/drawDefinition/positionActions/actionPolicyUtils';
import { getMatchUpScheduleBounds, MatchUpScheduleBounds } from '@Query/matchUp/getMatchUpScheduleBounds';
import { matchUpScheduleLocked, SCHEDULE_LOCK_ATTRIBUTES } from '@Query/matchUp/isScheduleLocked';

// constants and types
import { completedMatchUpStatuses, COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, MatchUp, Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  CHECK_IN,
  CHECK_IN_METHOD,
  CLEAR_SCHEDULE,
  END,
  SCHEDULE_DATE,
  SCHEDULE_ITEMS_METHOD,
  SCHEDULE_LOCK,
  SCHEDULE_LOCK_METHOD,
  SCHEDULE_TIME,
  SCOREKEEPER,
  SCOREKEEPER_METHOD,
  START,
} from '@Constants/matchUpActionConstants';

type ScheduleMatchUpActionsArgs = {
  inContextMatchUp?: HydratedMatchUp;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  /** a carried or produced exit: nothing is scheduled or staffed at it, as nothing is played there */
  carriedExit: boolean;
  /** both sides are present and the matchUp may be scored */
  readyToScore: boolean;
  policyActions?: { enabledActions?: string[]; disabledActions?: string[] };
  matchUpId: string;
  matchUp: MatchUp;
  drawId: string;
};

/**
 * The scheduling and staffing actions of a matchUp, each switchable by the matchUp actions policy (CA, 2026-10-30).
 *
 * - A BYE (never reaches here) and a carried or produced exit are offered none (nor an official: `matchUpActions`).
 * - A decided matchUp keeps its date, time, official, and start and end, which may be corrected after the fact, but not
 *   what readies a match still to be played: no schedule clear, lock, check-in or scorekeeper.
 * - A matchUp decided without being played (a walkover, default, double exit, cancellation, abandonment or dead
 *   rubber) has no start or end time to record.
 *
 * Presence is the permission: an action is omitted where its write would be refused (a locked placement is not
 * offered a date, time or clear). SCHEDULE_DATE, SCHEDULE_TIME, START and END carry the matchUp's schedule `bounds`
 * (`getMatchUpScheduleBounds`), so a picker can offer only what the write accepts.
 */
export function scheduleMatchUpActions({
  inContextMatchUp,
  tournamentRecord,
  drawDefinition,
  policyActions,
  readyToScore,
  carriedExit,
  matchUpId,
  matchUp,
  drawId,
}: ScheduleMatchUpActionsArgs): MatchUpAction[] {
  if (carriedExit) return [];

  const available = (action: string) => isAvailableAction({ policyActions, action });
  const validActions: MatchUpAction[] = [];

  const { matchUpStatus, winningSide } = matchUp;
  const concluded = !!winningSide || (!!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus));
  // only a match that was played has a start and an end: never one decided by an exit, a cancellation or a dead rubber
  const recordsPlay = !concluded || matchUpStatus === COMPLETED || matchUpStatus === RETIRED;

  const scheduled = inContextMatchUp ?? matchUp;
  const locked = matchUpScheduleLocked({ matchUp: scheduled });
  const placed = SCHEDULE_LOCK_ATTRIBUTES.some((attribute) => hasValue(scheduled.schedule?.[attribute]));
  const hasParticipant = !!inContextMatchUp?.sides?.some((side) => side?.participantId);

  let bounds: Partial<MatchUpScheduleBounds> | undefined;
  const scheduleBounds = () => {
    bounds ??= getMatchUpScheduleBounds({ tournamentRecord, drawDefinition, matchUpId }).bounds ?? {};
    return bounds;
  };
  const scheduleItem = (type: string, attribute: string, boundKeys: (keyof MatchUpScheduleBounds)[]) => {
    const all = scheduleBounds();
    const picked = Object.fromEntries(boundKeys.filter((key) => all[key]).map((key) => [key, all[key]]));
    validActions.push({
      payload: { drawId, matchUpId, schedule: { [attribute]: undefined } },
      method: SCHEDULE_ITEMS_METHOD,
      bounds: picked,
      type,
    });
  };

  if (!locked && available(SCHEDULE_DATE)) {
    scheduleItem(SCHEDULE_DATE, 'scheduledDate', ['earliestDate', 'latestDate', 'scheduledAfter', 'scheduledBefore']);
  }
  if (!locked && available(SCHEDULE_TIME)) {
    scheduleItem(SCHEDULE_TIME, 'scheduledTime', ['scheduledAfter', 'scheduledBefore']);
  }

  if (readyToScore && recordsPlay) {
    if (available(START)) scheduleItem(START, 'startTime', ['recordedAfter', 'recordedBefore']);
    if (available(END)) scheduleItem(END, 'endTime', ['recordedAfter', 'recordedBefore']);
  }

  if (concluded) return validActions;

  if (placed && !locked && available(CLEAR_SCHEDULE)) {
    validActions.push({
      payload: { drawId, matchUpId, schedule: { scheduledDate: '', scheduledTime: '', courtId: '', venueId: '' } },
      method: SCHEDULE_ITEMS_METHOD,
      type: CLEAR_SCHEDULE,
    });
  }

  // offered where a lock would mean something: the counterfactual asks the predicate enforcement reads
  const lockable = matchUpScheduleLocked({ matchUp: { ...scheduled, schedule: { ...scheduled.schedule, lock: {} } } });
  if (lockable && available(SCHEDULE_LOCK)) {
    validActions.push({
      payload: { drawId, matchUpId, lock: locked ? null : {} },
      method: SCHEDULE_LOCK_METHOD,
      type: SCHEDULE_LOCK,
      scheduleLocked: locked,
    });
  }

  if (hasParticipant && available(CHECK_IN)) {
    validActions.push({
      type: CHECK_IN,
      method: CHECK_IN_METHOD,
      payload: { drawId, matchUpId, participantId: undefined },
    });
  }
  if (hasParticipant && available(SCOREKEEPER)) {
    validActions.push({
      payload: { drawId, matchUpId, participantId: undefined },
      method: SCOREKEEPER_METHOD,
      type: SCOREKEEPER,
    });
  }

  return validActions;
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}
