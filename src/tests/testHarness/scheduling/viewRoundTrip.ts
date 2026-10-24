import { decodePlanningView, encodePlanningView } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';

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
  | { planned: true; samePlan: boolean; viewUnchanged: boolean; readsRecords: boolean; bytes: number };

export function checkViewRoundTrip({
  tournamentRecords,
  params = {},
}: {
  tournamentRecords: TournamentRecords;
  params?: Record<string, any>;
}): ViewRoundTrip {
  const view = buildSchedulingView({ ...params, tournamentRecords });
  if ('error' in view) return { planned: false };

  const text = encodePlanningView(view);
  const direct = planSchedule({ ...params, view });
  const decoded = decodePlanningView(text);
  const viaJson = planSchedule({ ...params, view: decoded });

  return {
    samePlan: JSON.stringify(direct) === JSON.stringify(viaJson),
    viewUnchanged: encodePlanningView(view) === text,
    readsRecords: 'tournamentRecords' in decoded,
    bytes: text.length,
    planned: true,
  };
}
