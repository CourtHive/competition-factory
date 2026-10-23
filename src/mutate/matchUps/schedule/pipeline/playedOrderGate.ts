import { BatchPlacement, checkBatchPlayedOrder, checkPlayedOrder, wasPlayed } from '../scheduleItems/playedOrder';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { zeroPad } from '@Tools/dateTime';

// constants and types
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';
import type { SchedulingView } from './view';
import type { SchedulePlan } from './plan';

/**
 * The played order in the pipeline (spec § 3.7; CA 2026-10-23, the write shape of SCHEDULING_PIPELINE_VNEXT.md § 7.A).
 *
 * - The GATE: the planner asks it of each slot it offers a matchUp, and a slot the rule refuses is never taken. Only a
 *   matchUp with a played source or a played dependent can be refused, so only those are asked.
 * - The GUARD: the writer asks it once of the whole plan, against the state the plan leaves, before anything is
 *   written. A plan made by the gate passes it; a refusal is a planner defect, and nothing is written.
 */
const plainTime = (scheduleTime: string) => scheduleTime.split(':').map(zeroPad).join(':');

export function playedOrderGate(view: SchedulingView, scheduleDate: string) {
  const played = new Set(view.hydrated.filter(wasPlayed).map(({ matchUpId }) => matchUpId));
  const hasPlayedNeighbour = (matchUpId: string) => {
    const { matchUpIds = [], dependentMatchUpIds = [] } = view.matchUpDependencies[matchUpId] ?? {};
    return [...matchUpIds, ...dependentMatchUpIds].some((id) => played.has(id));
  };
  const drawDefinitions = new Map<string, DrawDefinition | undefined>();
  const drawDefinitionOf = ({ tournamentId, drawId }: HydratedMatchUp) => {
    if (!drawDefinitions.has(drawId)) {
      const tournamentRecord = tournamentId ? view.tournamentRecords[tournamentId] : undefined;
      drawDefinitions.set(drawId, tournamentRecord && findDrawDefinition({ tournamentRecord, drawId }).drawDefinition);
    }
    return drawDefinitions.get(drawId);
  };

  return (matchUp: HydratedMatchUp, scheduleTime: string): unknown[] | undefined => {
    if (!played.size || !hasPlayedNeighbour(matchUp.matchUpId)) return undefined;
    const drawDefinition = drawDefinitionOf(matchUp);
    if (!drawDefinition) return undefined;
    const refusal = checkPlayedOrder({
      schedule: { scheduledDate: scheduleDate, scheduledTime: plainTime(scheduleTime) },
      matchUpDependencies: view.matchUpDependencies,
      inContextMatchUps: view.hydrated,
      matchUpId: matchUp.matchUpId,
      drawDefinition,
    });
    return refusal?.context?.blockingMatchUps;
  };
}

/** the guard: every placement of the plan judged together, every offender named; undefined when the plan passes */
export function planPlayedOrderRefusal({ plan, view }: { plan: SchedulePlan; view: SchedulingView }) {
  const byTournament = new Map<string, BatchPlacement[]>();
  for (const [scheduledDate, venues] of Object.entries(plan.placements)) {
    for (const { matchUpId, scheduleTime } of Object.values(venues).flat()) {
      const matchUp = view.matchUps.get(matchUpId);
      if (!matchUp?.tournamentId) continue;
      const placements = byTournament.get(matchUp.tournamentId) ?? [];
      placements.push({
        drawId: matchUp.drawId,
        matchUpId,
        schedule: { scheduledDate, scheduledTime: plainTime(scheduleTime) },
      });
      byTournament.set(matchUp.tournamentId, placements);
    }
  }

  const refusals: unknown[] = [];
  for (const [tournamentId, placements] of byTournament) {
    const tournamentRecord = view.tournamentRecords[tournamentId];
    if (!tournamentRecord) continue;
    const refusal: ResultType | undefined = checkBatchPlayedOrder({
      matchUpDependencies: view.matchUpDependencies,
      inContextMatchUps: view.hydrated,
      allRefusals: true,
      tournamentRecord,
      placements,
    });
    refusals.push(...(refusal?.context?.refusals ?? []));
  }
  if (!refusals.length) return undefined;
  return decorateResult({
    result: { error: ANACHRONISM },
    info: 'the plan places matchUps before played matchUps they depend on; nothing was written',
    stack: 'planPlayedOrderRefusal',
    context: { refusals },
  });
}
