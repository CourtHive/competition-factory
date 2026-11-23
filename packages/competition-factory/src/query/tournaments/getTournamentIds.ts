import { SUCCESS } from '@Constants/resultConstants';
import { isObject } from '@Tools/objects';

export function getTournamentIds({ tournamentRecords }) {
  const tournamentIds = isObject(tournamentRecords) ? Object.keys(tournamentRecords) : [];
  return { tournamentIds, ...SUCCESS };
}
