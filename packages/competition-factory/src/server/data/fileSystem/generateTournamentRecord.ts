import { saveTournamentRecords } from './saveTournamentRecords';
import * as governors from '@Assemblies/governors';

// constants and types
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

export function generateTournamentRecord(mockProfile?: any) {
  const mockResult = governors.mocksGovernor.generateTournamentRecord(mockProfile);

  if (!mockResult || mockResult.error) {
    throw new Error(mockResult?.error || 'Could not generate tournament record');
  }

  const tournamentRecord: Tournament = mockResult.tournamentRecord;
  const tournamentRecords: TournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  saveTournamentRecords({ tournamentRecords });

  return { tournamentRecord, ...SUCCESS };
}
