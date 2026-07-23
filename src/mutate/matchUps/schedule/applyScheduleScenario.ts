import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';

// constants and types
import { MISSING_TOURNAMENT_RECORDS, SCHEDULE_SCENARIO_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ScheduleScenario, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';

type ApplyScheduleScenarioArgs = {
  tournamentRecords?: TournamentRecords;
  scheduleCompletedMatchUps?: boolean;
  tournamentRecord?: Tournament;
  removePriorValues?: boolean;
  scenarioId: string;
};

/**
 * Commit an alternate scheduling plan as the official schedule.
 *
 * A scenario's `placements` array is, by construction, a `bulkScheduleMatchUps`
 * `matchUpDetails` payload — so applying is a direct hand-off. `bulkScheduleMatchUps`
 * already **skips completed matchUps by default**, satisfying "apply to
 * uncompleted matchUps only" without extra work. `removePriorValues` defaults
 * to `true` to match TMX grid-drop semantics (re-dated matchUps shed stale grid
 * position). The scenario is left in place; the caller decides whether to remove
 * it post-commit. Drift / rebase reconciliation lands in Phase 1.
 */
export function applyScheduleScenario(params: ApplyScheduleScenarioArgs) {
  const { tournamentRecord, scenarioId, removePriorValues = true, scheduleCompletedMatchUps = false } = params;

  const tournamentRecords =
    params.tournamentRecords ?? (tournamentRecord ? { [tournamentRecord.tournamentId]: tournamentRecord } : undefined);

  if (!tournamentRecords || !Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  let scenario: ScheduleScenario | undefined;
  for (const record of Object.values(tournamentRecords)) {
    scenario = (record.scheduling?.scenarios ?? []).find((s) => s.scenarioId === scenarioId);
    if (scenario) break;
  }
  if (!scenario) return { error: SCHEDULE_SCENARIO_NOT_FOUND };

  const result = bulkScheduleMatchUps({
    scheduleCompletedMatchUps,
    matchUpDetails: scenario.placements,
    removePriorValues,
    tournamentRecords,
  });
  if (result.error) return result;

  const applied = (result as { scheduled?: number }).scheduled ?? 0;
  return { ...result, scenarioId, applied };
}
