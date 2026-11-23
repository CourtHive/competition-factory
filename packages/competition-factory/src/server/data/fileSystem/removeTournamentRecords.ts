import { codesRecordFile, legacyRecordFile } from './tournamentRecordFile';
import * as fs from 'fs-extra';

// constants
import { SUCCESS } from '@Constants/resultConstants';

export async function removeTournamentRecords(params?: any) {
  const tournamentIds = params?.tournamentIds ?? [params?.tournamentId].filter(Boolean);
  let removed = 0;

  for (const tournamentId of tournamentIds) {
    // a record saved before the rename may still sit under the legacy suffix; remove whichever exist
    const files = [codesRecordFile(tournamentId), legacyRecordFile(tournamentId)].filter(
      (file): file is string => !!file && fs.existsSync(file),
    );
    files.forEach((file) => fs.removeSync(file));
    if (files.length) removed += 1;
  }

  return { ...SUCCESS, removed };
}
