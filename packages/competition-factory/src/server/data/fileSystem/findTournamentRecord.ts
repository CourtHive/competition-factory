import { STORAGE_DIR, existingRecordFile } from './tournamentRecordFile';
import { UTF8 } from '@Server/common/constants/app';
import * as fs from 'fs-extra';

export async function findTournamentRecord({ tournamentId }) {
  fs.ensureDirSync(STORAGE_DIR);

  const tournamentFile = existingRecordFile(tournamentId);
  if (tournamentFile) {
    const record = fs.readFileSync(tournamentFile, UTF8);
    const tournamentRecord = JSON.parse(record.trim() || '{}');
    return { tournamentRecord };
  } else {
    return { error: 'Tournament not found' };
  }
}
