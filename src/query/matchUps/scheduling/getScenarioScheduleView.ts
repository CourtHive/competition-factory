import {
  getScheduleScenarioStatus,
  findScopedScenario,
} from '@Query/matchUps/scheduling/scheduleScenarioReconciliation';
import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { MatchUpFilters, TournamentRecords } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

type GetScenarioScheduleViewArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  tournamentId?: string;
  scenarioId: string;
  matchUpFilters?: MatchUpFilters;
  withCourtGridRows?: boolean;
  courtCompletedMatchUps?: boolean;
  minCourtGridRows?: number;
};

/**
 * Grid-ready projection of a scenario for TMX "Plan mode" — the `competitionScheduleMatchUps`
 * shape (`dateMatchUps` / `rows` / `courtsData` / `courtPrefix`) with the scenario's placements
 * laid on top, so the client renders the plan through its existing grid path unchanged.
 *
 * Purity: the overlay is applied to a THROWAWAY deep copy of the records; the real
 * records / engine state are never mutated (the "not applied" guarantee). Completed
 * matchUps are skipped by `bulkScheduleMatchUps`. `plannedMatchUpIds` /
 * `skippedCompletedMatchUpIds` (derived from the real state) let the client tint the
 * planned cells and warn about skips.
 */
export function getScenarioScheduleView(params: GetScenarioScheduleViewArgs): any {
  const { scenario, error } = findScopedScenario(params);
  if (error || !scenario) return { error };

  const source =
    params.tournamentRecords ??
    (params.tournamentRecord ? { [params.tournamentRecord.tournamentId]: params.tournamentRecord } : {});
  const draft = makeDeepCopy(source, false, true);

  bulkScheduleMatchUps({
    tournamentRecords: draft,
    matchUpDetails: scenario.placements,
    removePriorValues: true,
  });

  const view = competitionScheduleMatchUps({
    tournamentRecords: draft,
    matchUpFilters: params.matchUpFilters,
    withCourtGridRows: params.withCourtGridRows ?? true,
    courtCompletedMatchUps: params.courtCompletedMatchUps ?? true,
    minCourtGridRows: params.minCourtGridRows,
    usePublishState: false,
  });

  const status: any = getScheduleScenarioStatus(params);

  return {
    ...view,
    plannedMatchUpIds: status.applicableMatchUpIds ?? [],
    skippedCompletedMatchUpIds: status.completedMatchUpIds ?? [],
  };
}
