import { validateScheduleScenario } from '@Validators/validateScheduleScenario';
import { UUID } from '@Tools/UUID';

// constants and types
import { ScheduleScenario, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_TOURNAMENT_RECORD,
  SCHEDULE_SCENARIO_NOT_FOUND,
  SCHEDULE_SCENARIO_EXISTS,
} from '@Constants/errorConditionConstants';

type RecordResolution = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  tournamentId?: string;
};

// Resolve the scenario-bearing record under either engine: tournamentEngine
// injects `tournamentRecord`; competitionEngine injects `tournamentRecords`
// (+ `tournamentId` when scoped, or a single record otherwise).
function resolveRecord({
  tournamentRecords,
  tournamentRecord,
  tournamentId,
}: RecordResolution): Tournament | undefined {
  if (tournamentRecord) return tournamentRecord;
  if (!tournamentRecords) return undefined;
  if (tournamentId && tournamentRecords[tournamentId]) return tournamentRecords[tournamentId];
  const values = Object.values(tournamentRecords);
  return values.length === 1 ? values[0] : undefined;
}

function recordsFor(record: Tournament, tournamentRecords?: TournamentRecords): TournamentRecords {
  return tournamentRecords ?? { [record.tournamentId]: record };
}

/**
 * Read the alternate ("contingency") scheduling plans stored first-class on
 * `tournamentRecord.scheduling.scenarios`. Never touches / emits an extension.
 */
export function getScheduleScenarios(params: RecordResolution): { scenarios?: ScheduleScenario[]; error?: any } {
  const record = resolveRecord(params);
  if (!record) return { error: MISSING_TOURNAMENT_RECORD };
  return { scenarios: record.scheduling?.scenarios ?? [] };
}

export function getScheduleScenario(params: RecordResolution & { scenarioId: string }): {
  scenario?: ScheduleScenario;
  error?: any;
} {
  const record = resolveRecord(params);
  if (!record) return { error: MISSING_TOURNAMENT_RECORD };
  const scenario = (record.scheduling?.scenarios ?? []).find((s) => s.scenarioId === params.scenarioId);
  if (!scenario) return { error: SCHEDULE_SCENARIO_NOT_FOUND };
  return { scenario };
}

type AddScheduleScenarioArgs = RecordResolution & {
  scenario: Partial<ScheduleScenario> & { scenarioName: string };
};
export function addScheduleScenario(params: AddScheduleScenarioArgs): {
  scenario?: ScheduleScenario;
  scenarioId?: string;
  success?: boolean;
  error?: any;
  info?: string;
} {
  const record = resolveRecord(params);
  if (!record) return { error: MISSING_TOURNAMENT_RECORD };

  const { scenario } = params;
  const validity = validateScheduleScenario({
    tournamentRecords: recordsFor(record, params.tournamentRecords),
    scenario,
  });
  if (!validity.valid) return { error: validity.error, info: validity.info };

  if (!record.scheduling) record.scheduling = {};
  if (!Array.isArray(record.scheduling.scenarios)) record.scheduling.scenarios = [];

  const scenarioId = scenario.scenarioId ?? UUID();
  if (record.scheduling.scenarios.some((s) => s.scenarioId === scenarioId)) return { error: SCHEDULE_SCENARIO_EXISTS };

  const newScenario = { ...scenario, scenarioId, placements: scenario.placements ?? [] } as ScheduleScenario;
  record.scheduling.scenarios.push(newScenario);

  return { ...SUCCESS, scenario: newScenario, scenarioId };
}

type UpdateScheduleScenarioArgs = RecordResolution & {
  updates: Partial<ScheduleScenario>;
  scenarioId: string;
};
export function updateScheduleScenario(params: UpdateScheduleScenarioArgs): {
  scenario?: ScheduleScenario;
  success?: boolean;
  error?: any;
  info?: string;
} {
  const record = resolveRecord(params);
  if (!record) return { error: MISSING_TOURNAMENT_RECORD };

  const scenarios = record.scheduling?.scenarios ?? [];
  const index = scenarios.findIndex((s) => s.scenarioId === params.scenarioId);
  if (index < 0) return { error: SCHEDULE_SCENARIO_NOT_FOUND };

  const merged = { ...scenarios[index], ...params.updates, scenarioId: params.scenarioId } as ScheduleScenario;

  const validity = validateScheduleScenario({
    tournamentRecords: recordsFor(record, params.tournamentRecords),
    scenario: merged,
  });
  if (!validity.valid) return { error: validity.error, info: validity.info };

  scenarios[index] = merged;
  return { ...SUCCESS, scenario: merged };
}

export function removeScheduleScenario(params: RecordResolution & { scenarioId: string }): {
  success?: boolean;
  error?: any;
} {
  const record = resolveRecord(params);
  if (!record) return { error: MISSING_TOURNAMENT_RECORD };

  const scenarios = record.scheduling?.scenarios ?? [];
  const remaining = scenarios.filter((s) => s.scenarioId !== params.scenarioId);
  if (remaining.length === scenarios.length) return { error: SCHEDULE_SCENARIO_NOT_FOUND };

  record.scheduling!.scenarios = remaining;
  return { ...SUCCESS };
}
