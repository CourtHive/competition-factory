import { findTournamentRecord } from './findTournamentRecord';

// constants
import { errorConditionConstants } from '@Constants/index';
import { SUCCESS } from '@Constants/resultConstants';

errorConditionConstants;
export async function fetchTournamentRecords(params?: { tournamentIds?: string[]; tournamentId?: string }) {
  if (!params) return { error: { message: 'No params provided' } };

  const tournamentIds =
    (params?.tournamentIds?.length && params.tournamentIds) || [params?.tournamentId].filter(Boolean);

  const tournamentRecords = {};
  let fetched = 0,
    notFound = 0;
  for (const tournamentId of tournamentIds) {
    const result = await findTournamentRecord({ tournamentId });
    if (result.tournamentRecord) {
      const tournamentId = result.tournamentRecord.tournamentId;
      tournamentRecords[tournamentId] = result.tournamentRecord;
      fetched += 1;
    } else {
      notFound += 1;
    }
  }

  if (!fetched) return { error: errorConditionConstants.MISSING_TOURNAMENT_RECORD };

  return { ...SUCCESS, tournamentRecords, fetched, notFound };
}
