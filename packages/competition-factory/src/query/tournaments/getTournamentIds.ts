import { SUCCESS } from '@Constants/resultConstants';
import { isObject } from '@Tools/objects';
import type { TournamentRecords } from '@Types/factoryTypes';

type GetTournamentIdsArgs = {
  tournamentRecords?: TournamentRecords;
};
export function getTournamentIds({ tournamentRecords }: GetTournamentIdsArgs) {
  const tournamentIds = isObject(tournamentRecords) ? Object.keys(tournamentRecords!) : [];
  return { tournamentIds, ...SUCCESS };
}
