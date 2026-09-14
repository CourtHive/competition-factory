import { getMutationEngine } from '@Server/providers/factory/engines/mutationEngine';
import { recordStorage } from '@Server/data/fileSystem';
import { Logger } from '@nestjs/common';

// types
import { TournamentRecords } from '@Types/factoryTypes';

export async function executionQueue(payload: any) {
  const { executionQueue = [] } = payload ?? {};
  const tournamentIds = payload?.tournamentIds || (payload?.tournamentId && [payload.tournamentId]) || [];

  if (!tournamentIds.length) {
    Logger.error('No tournamentRecord provided');
    return { error: 'No tournamentIds provided' };
  }

  const result = await recordStorage.fetchTournamentRecords({ tournamentIds });
  if (result.error) return result;

  const mutationEngine = getMutationEngine();
  mutationEngine.setState(result.tournamentRecords);
  const mutationResult = await mutationEngine.executionQueue(executionQueue);

  if (mutationResult.success) {
    const mutatedTournamentRecords: TournamentRecords = mutationEngine.getState().tournamentRecords;
    const updateResult = await recordStorage.saveTournamentRecords({
      tournamentRecords: mutatedTournamentRecords,
    });
    if (!updateResult.success) {
      return { error: 'Coult not persist tournament record(s)' };
    }
  }

  return mutationResult;
}
