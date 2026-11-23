import { queryEngine } from '@Server/providers/factory/engines/queryEngine';
import recordStorage from '@Server/data/fileSystem';
import { Logger } from '@nestjs/common';

export async function queryTournamentRecords(payload) {
  const tournamentIds = payload?.tournamentIds || (payload?.tournamentId && [payload.tournamentId]) || [];

  if (!tournamentIds.length) {
    Logger.error('No tournamentRecord provided');
    return { error: 'No tournamentIds provided' };
  }

  const result = await recordStorage.fetchTournamentRecords({ tournamentIds });
  if (result.error) return result;
  queryEngine.setState(result.tournamentRecords);

  const { method, params } = payload;
  return queryEngine[method](params);
}
