import { UTF8 } from '@Server/common/constants/app';
import * as fs from 'fs-extra';

export async function findTournamentRecord({ tournamentId }) {
  const tournamentFile = `./src/data/fileSystem/storage/${tournamentId}.tods.json`;
  fs.ensureDirSync(`./src/data/fileSystem/storage`);

  if ((await fs.existsSync(tournamentFile)) === true) {
    const record = await fs.readFileSync(tournamentFile, UTF8);
    const tournamentRecord = JSON.parse(record.trim() || '{}');
    return { tournamentRecord };
  } else {
    return { error: 'Tournament not found' };
  }
}
