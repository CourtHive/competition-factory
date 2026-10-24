import { decodePlanningView, planningViewData } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import { overTheWire } from '../kernel/kernel';

// types
import { TournamentRecords } from '@Types/factoryTypes';

/**
 * The closed-view property of the profile scheduler's planner: a plan made from a view equals the plan made from the same
 * view written as JSON and read back (`viewCodec.ts`), and planning does not change the view it reads. The JSON view
 * carries no records, so equality also proves the planner reads none.
 *
 * The view is built from the records a `scheduleProfileRounds` call starts from, with the call's own parameters; the
 * property holds for any view, so a call that plans on a cleared working copy is checked on the uncleared one.
 */
export type ViewRoundTrip =
  | { planned: false }
  | {
      planned: true;
      samePlan: boolean;
      viewUnchanged: boolean;
      readsRecords: boolean;
      bytes: number;
      /** the call as a `kernel.scheduling.plan@1` case: the view as plain data, the plan options, and the plan */
      harvest: { view: Record<string, unknown>; options: Record<string, unknown>; plan: unknown };
    };

/** the call's parameters the planner itself takes; the rest (dates, courts) shaped the view */
const PLAN_OPTION_KEYS = [
  'checkPotentialRequestConflicts',
  'excludeNoDateCompleted',
  'clearScheduleDates',
  'excludePriorDates',
  'periodLength',
];

export function checkViewRoundTrip({
  tournamentRecords,
  params = {},
}: {
  tournamentRecords: TournamentRecords;
  params?: Record<string, any>;
}): ViewRoundTrip {
  const view = buildSchedulingView({ ...params, tournamentRecords });
  if ('error' in view) return { planned: false };

  const data = planningViewData(view);
  const text = JSON.stringify(data);
  const direct = planSchedule({ ...params, view });
  const decoded = decodePlanningView(text);
  const viaJson = planSchedule({ ...params, view: decoded });
  const options = Object.fromEntries(
    PLAN_OPTION_KEYS.filter((key) => params[key] !== undefined).map((key) => [key, params[key]]),
  );

  return {
    harvest: { view: JSON.parse(text), options, plan: overTheWire(direct) },
    samePlan: JSON.stringify(direct) === JSON.stringify(viaJson),
    viewUnchanged: JSON.stringify(planningViewData(view)) === text,
    readsRecords: 'tournamentRecords' in decoded,
    bytes: text.length,
    planned: true,
  };
}
