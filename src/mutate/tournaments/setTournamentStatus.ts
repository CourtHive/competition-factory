import { tournamentStatuses } from '@Constants/tournamentConstants';

// constants
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

const validStatuses = new Set<string>(tournamentStatuses);

export function setTournamentStatus({ tournamentRecord, status }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  if (status && !validStatuses.has(status)) return { error: INVALID_VALUES, info: 'Unknown status' };

  tournamentRecord.tournamentStatus = status;

  return { ...SUCCESS };
}
