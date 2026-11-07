import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { CLEAR_SCORE, REMOVE_DIRECTED, satisfiedDoubleExit } from './planShared';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import type { OutcomeRequest, OutcomeView, PlanArgs, Route } from '../types';
import type { MatchUpSchedule, Structure } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/**
 * A schedule or notes the call carries (S7): planned where v1's own writer leaves them on the matchUp alone, abstained
 * otherwise.
 */

/**
 * S7: the call's notes. v1 writes them inside `modifyMatchUpScore` (`addNotes`), on every matchUp a writer reaches with
 * the call's params: the call's own on the winner, score-only, removal and clear routes (`attemptToModifyScore`,
 * `removeDirectedParticipants`), which v2 plans (`resultOps`). Deferred: a TEAM call (the dual's tally write), a double
 * exit before or after (`doubleExitAdvancement` and `removeDoubleExit` forward the params to the exits they write), and
 * every other route
 */
const NOTED_ROUTES = new Set<Route | undefined>(['winner', 'only-score', REMOVE_DIRECTED, CLEAR_SCORE]);
export function notesReason(request: OutcomeRequest, view: OutcomeView, route?: Route): boolean {
  if (!request.carries?.notes) return false;
  // the test fixture `{ testing: true }`, written by `addNotes` as given: not planned (deferred)
  if (typeof request.carries.notes !== 'string') return true;
  if (view.isTeam || view.line || view.matchUpTieId) return true;
  if (isDoubleExit(request.matchUpStatus) || isDoubleExit(view.existing.matchUpStatus)) return true;
  return !NOTED_ROUTES.has(route);
}

/** the schedule attributes v2 plans: those v1's writer writes on the matchUp alone (S7) */
const PLANNED_SCHEDULE = new Set(['scheduledDate', 'scheduledTime', 'courtId', 'venueId', 'courtOrder']);

/**
 * S7: a call carrying a schedule. v1 asks its writer's refusals before the outcome (`addMatchUpScheduleItems`,
 * `validateOnly`) and writes it after (`disableNotice`), before `applyScoredTime` stamps onto it. v2 plans it where the
 * write lands on the matchUp alone, a date, a time, a court, a venue or a court order, as v1's own writer leaves it on a
 * copy of the matchUp (`scheduledFor`). Stays v1's: a schedule v1 refuses (an apply-stage refusal), any other attribute
 * (start, stop, resume and end times, officials, ...), and a double exit asked for again. A result turned into a double
 * exit is planned through `planOps` too, so it carries the schedule. A TEAM line is held in its dual's `tieMatchUps`, not
 * a structure's matchUps, so `scheduledFor` finds none and it stays v1's.
 */
export function scheduleReason(args: PlanArgs): boolean {
  const schedule = args.request.carries?.schedule;
  if (!schedule) return false;
  if (Object.keys(schedule).some((key) => !PLANNED_SCHEDULE.has(key))) return true;
  // a double exit asked for again writes nothing (`satisfiedDoubleExit`): v1 still writes the schedule
  if (satisfiedDoubleExit(args.view, args.request, args.route)) return true;
  return !scheduledFor(args);
}

/** the schedule the plan writes, once per request: the reason and the ops both read it */
const scheduled = new WeakMap<OutcomeRequest, MatchUpSchedule | undefined>();

/**
 * The matchUp's whole stored `schedule` after v1's writer has written the call's schedule on it, read by running that
 * writer, refusals first against the stored draw (nothing written), then on a copy of the matchUp in a draw holding it
 * alone. Undefined where v1 refuses it or the matchUp is not stored.
 */
function scheduledFor({
  tournamentRecord,
  drawDefinition,
  request,
}: Pick<PlanArgs, 'tournamentRecord' | 'drawDefinition' | 'request'>): MatchUpSchedule | undefined {
  if (scheduled.has(request)) return scheduled.get(request);
  const schedule = request.carries?.schedule;
  const matchUpId = request.matchUpId;
  let written: MatchUpSchedule | undefined;
  if (schedule && drawDefinition && tournamentRecord && matchUpId) {
    const args = { tournamentRecord, matchUpId, schedule, disableNotice: true };
    const check = addMatchUpScheduleItems({ ...args, drawDefinition, validateOnly: true });
    const structure = check.error ? undefined : holdingStructure(drawDefinition.structures, matchUpId);
    const stored = matchUpsOf(structure)?.find((matchUp) => matchUp.matchUpId === matchUpId);
    if (structure && stored) {
      const copy = structuredClone(stored);
      const scratch = { ...drawDefinition, structures: [{ ...structure, matchUps: [copy] } as Structure] };
      written = addMatchUpScheduleItems({ ...args, drawDefinition: scratch }).error ? undefined : (copy.schedule ?? {});
    }
  }
  scheduled.set(request, written);
  return written;
}

/** the structure whose own matchUps hold the matchUp: a round robin's group, not its container */
function holdingStructure(structures: Structure[] | undefined, matchUpId: string): Structure | undefined {
  for (const structure of structures ?? []) {
    if (matchUpsOf(structure)?.some((matchUp) => matchUp.matchUpId === matchUpId)) return structure;
    const held = holdingStructure(structuresOf(structure), matchUpId);
    if (held) return held;
  }
  return undefined;
}

export function scheduleOps(args: PlanArgs, matchUpId: string): OutcomeOp[] {
  const schedule = args.request.carries?.schedule && scheduledFor(args);
  return schedule ? [{ op: 'setMatchUpSchedule', matchUpId, schedule }] : [];
}
