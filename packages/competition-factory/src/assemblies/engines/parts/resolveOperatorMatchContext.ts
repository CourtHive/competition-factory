import { INVALID_VALUES, MATCHUP_NOT_FOUND, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import type { TournamentRecords } from '@Types/factoryTypes';

const targetIds = ['tournamentId', 'eventId', 'drawId', 'matchUpId'] as const;
// executeFunction supplies activeTournamentId before middleware. Only the explicit target selects a record.
const allowed = new Set<string>([...targetIds, 'operatorAudience', 'activeTournamentId']);

/** Resolve the opt-in DTO request within one record after loadedFootprint has admitted it. */
export function resolveOperatorMatchContext(records: TournamentRecords, params: Record<string, any>) {
  const { tournamentId, eventId, drawId, matchUpId, operatorAudience } = params;
  if (
    (operatorAudience !== 'recorder' && operatorAudience !== 'director') ||
    Object.keys(params).some((key) => !allowed.has(key)) ||
    targetIds.some((key) => typeof params[key] !== 'string' || !params[key])
  )
    return { error: INVALID_VALUES };

  const tournamentRecord = records[tournamentId];
  if (tournamentRecord?.tournamentId !== tournamentId) return { error: MISSING_TOURNAMENT_RECORD };
  const event = tournamentRecord.events?.find((item) => item.eventId === eventId);
  const drawDefinition = event?.drawDefinitions?.find((item) => item.drawId === drawId);
  if (!drawDefinition) return { error: MATCHUP_NOT_FOUND };

  return { tournamentId, eventId, drawId, matchUpId, operatorAudience, tournamentRecord, event, drawDefinition };
}
