import { STORAGE_DIR, codesRecordFile, legacyRecordFile } from './tournamentRecordFile';
import * as fs from 'fs-extra';

// constants
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { UTF8 } from '@Server/common/constants/app';
import { Tournament } from '@Types/tournamentTypes';

export async function saveTournamentRecords(params?: {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
}) {
  const tournamentRecords =
    params?.tournamentRecords ??
    (params?.tournamentRecord ? { [params.tournamentRecord.tournamentId]: params.tournamentRecord } : {});

  fs.ensureDirSync(STORAGE_DIR);

  for (const tournamentId of Object.keys(tournamentRecords)) {
    const codesFile = codesRecordFile(tournamentId);
    const legacyFile = legacyRecordFile(tournamentId);
    if (!codesFile || !legacyFile) continue; // an id that would leave the storage directory is never written
    const content = JSON.stringify(tournamentRecords[tournamentId], null, 2);
    fs.writeFileSync(codesFile, content, UTF8, (err) => {
      if (err) console.log(`error: ${err}`);
    });
    // the codes file now shadows any legacy copy; drop it so the two can never disagree
    fs.removeSync(legacyFile);
  }

  return { ...SUCCESS };
}
