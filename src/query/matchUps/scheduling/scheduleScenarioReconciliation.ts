import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ScheduleScenario, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SCHEDULE_SCENARIO_NOT_FOUND } from '@Constants/errorConditionConstants';

type RecordScope = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
};

export function collectScopedRecords({ tournamentRecords, tournamentRecord }: RecordScope): Tournament[] {
  if (tournamentRecords) return Object.values(tournamentRecords);
  return tournamentRecord ? [tournamentRecord] : [];
}

// matchUpId → raw matchUp (schedule + status) across every record in scope.
function collectMatchUps(scope: RecordScope): { [matchUpId: string]: any } {
  const map: { [matchUpId: string]: any } = {};
  for (const record of collectScopedRecords(scope)) {
    const { matchUps = [] } = allTournamentMatchUps({ tournamentRecord: record, inContext: false });
    for (const matchUp of matchUps) map[matchUp.matchUpId] = matchUp;
  }
  return map;
}

export function findScopedScenario(scope: RecordScope & { scenarioId: string }): {
  scenario?: ScheduleScenario;
  error?: any;
} {
  for (const record of collectScopedRecords(scope)) {
    const scenario = (record.scheduling?.scenarios ?? []).find((s) => s.scenarioId === scope.scenarioId);
    if (scenario) return { scenario };
  }
  return { error: SCHEDULE_SCENARIO_NOT_FOUND };
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic fingerprint of the **official** schedule of a set of matchUps —
 * the anchor a scenario is authored against. Compares each matchUp's placement
 * (scheduledDate/Time, courtId, courtOrder) and status (matchUpStatus, winningSide);
 * a change to any of those between authoring and now means the scenario's baseline
 * has drifted. Order-independent (matchUpIds sorted) and pure.
 */
export function computeScheduleFingerprint(params: RecordScope & { matchUpIds: string[] }): string {
  const ids = [...new Set(params.matchUpIds)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const map = collectMatchUps(params);
  const tuples = ids.map((id) => {
    const matchUp = map[id];
    if (!matchUp) return `${id}|MISSING`;
    const s = matchUp.schedule ?? {};
    return [
      id,
      s.scheduledDate ?? '',
      s.scheduledTime ?? '',
      s.courtId ?? '',
      s.courtOrder ?? '',
      matchUp.matchUpStatus ?? '',
      matchUp.winningSide ?? '',
    ].join('|');
  });
  return fnv1a(tuples.join('\n'));
}

type ScheduleScenarioStatus = {
  scenarioId: string;
  outOfDate: boolean; // the official baseline moved since authoring/rebase
  currentHash: string;
  basedOnHash?: string;
  completedMatchUpIds: string[]; // placements whose matchUp is now completed → skipped on apply
  missingMatchUpIds: string[]; // placements whose matchUpId no longer exists
  applicableMatchUpIds: string[]; // placements that would actually be scheduled
  error?: any;
};

/**
 * Reconcile a scenario against current state so TMX can alert when a plan is out
 * of date and preview what a commit would actually do. `outOfDate` is the
 * aggregate baseline-drift check (fingerprint mismatch); `completedMatchUpIds`
 * and `missingMatchUpIds` are the placements a commit would silently drop.
 */
export function getScheduleScenarioStatus(
  params: RecordScope & { tournamentId?: string; scenarioId: string },
): ScheduleScenarioStatus | { error: any } {
  const { scenario, error } = findScopedScenario(params);
  if (error || !scenario) return { error };

  const matchUpIds = [...new Set(scenario.placements.map((p) => p.matchUpId))];
  const map = collectMatchUps(params);

  const completedMatchUpIds: string[] = [];
  const missingMatchUpIds: string[] = [];
  const applicableMatchUpIds: string[] = [];
  for (const id of matchUpIds) {
    const matchUp = map[id];
    if (!matchUp) missingMatchUpIds.push(id);
    else if (matchUp.winningSide || completedMatchUpStatuses.includes(matchUp.matchUpStatus))
      completedMatchUpIds.push(id);
    else applicableMatchUpIds.push(id);
  }

  const currentHash = computeScheduleFingerprint({ ...params, matchUpIds });
  const outOfDate = scenario.basedOnHash !== undefined && scenario.basedOnHash !== currentHash;

  return {
    scenarioId: scenario.scenarioId,
    outOfDate,
    currentHash,
    basedOnHash: scenario.basedOnHash,
    completedMatchUpIds,
    missingMatchUpIds,
    applicableMatchUpIds,
  };
}
