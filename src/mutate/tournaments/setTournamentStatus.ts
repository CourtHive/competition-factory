import { tournamentStatuses } from '@Constants/tournamentConstants';

import { SUCCESS } from '@Constants/resultConstants';
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

const validStatuses = new Set<string>(tournamentStatuses);

export function setTournamentStatus({ tournamentRecord, status }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  if (status && !validStatuses.has(status)) return { error: INVALID_VALUES, info: 'Unknown status' };

  tournamentRecord.tournamentStatus = status;

  return { ...SUCCESS };
}
