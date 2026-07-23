import { isValidDateString } from '@Tools/dateTime';

import { INVALID_VALUES } from '@Constants/errorConditionConstants';

type ValidateScheduleScenarioArgs = {
  tournamentRecords?: { [key: string]: any };
  scenario: any;
};

/**
 * Shape + light referential validation for a {@link ScheduleScenario}.
 * Placement matchUp/court existence is validated against the live schedule at
 * projection time (Phase 1); here we guarantee a well-formed, commit-ready
 * object and that every placement targets a known tournamentId (when
 * tournamentRecords are supplied).
 */
export function validateScheduleScenario({ tournamentRecords, scenario }: ValidateScheduleScenarioArgs): {
  valid: boolean;
  error?: any;
  info?: string;
} {
  const invalid = (info: string) => ({ valid: false, error: INVALID_VALUES, info });

  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario))
    return invalid('scenario must be an object');
  if (typeof scenario.scenarioName !== 'string' || !scenario.scenarioName.trim())
    return invalid('scenarioName is required');
  if (scenario.scenarioId !== undefined && typeof scenario.scenarioId !== 'string')
    return invalid('scenarioId must be a string');

  if (
    scenario.scheduledDates !== undefined &&
    (!Array.isArray(scenario.scheduledDates) || !scenario.scheduledDates.every((d) => isValidDateString(d)))
  )
    return invalid('scheduledDates must be an array of valid date strings');

  if (!Array.isArray(scenario.placements)) return invalid('placements must be an array');

  const tournamentIds = tournamentRecords ? Object.keys(tournamentRecords) : undefined;

  for (const placement of scenario.placements) {
    if (!placement || typeof placement !== 'object') return invalid('invalid placement');
    if (typeof placement.matchUpId !== 'string' || !placement.matchUpId)
      return invalid('placement.matchUpId is required');
    if (typeof placement.tournamentId !== 'string' || !placement.tournamentId)
      return invalid('placement.tournamentId is required');
    if (!placement.schedule || typeof placement.schedule !== 'object') return invalid('placement.schedule is required');
    if (tournamentIds && !tournamentIds.includes(placement.tournamentId))
      return invalid('placement.tournamentId not present in tournamentRecords');
  }

  return { valid: true };
}
