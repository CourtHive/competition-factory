import { modifyTournamentDetailNotice } from './tournamentDetailNotice';
import { tournamentStatuses } from '@Constants/tournamentConstants';

// constants
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { Tournament } from '@Types/tournamentTypes';

const validStatuses = new Set<string>(tournamentStatuses);

type SetTournamentStatusArgs = {
  tournamentRecord: Tournament;
  /** one of the tournament statuses; undefined clears it */
  status?: Tournament['tournamentStatus'];
};
export function setTournamentStatus({ tournamentRecord, status }: SetTournamentStatusArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  if (status && !validStatuses.has(status)) return { error: INVALID_VALUES, info: 'Unknown status' };

  const changed = tournamentRecord.tournamentStatus !== status;
  tournamentRecord.tournamentStatus = status;

  // MODIFY_TOURNAMENT_DETAIL when the status changed; setting the status it already has sends nothing
  if (changed) modifyTournamentDetailNotice({ tournamentRecord, detail: { tournamentStatus: status } });

  return { ...SUCCESS };
}
