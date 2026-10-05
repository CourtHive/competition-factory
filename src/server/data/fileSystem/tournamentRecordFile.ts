import * as fs from 'fs-extra';

export const STORAGE_DIR = './src/data/fileSystem/storage';

/** Records are written as CODES; `.tods.json` is the legacy suffix, still read so stored records load. */
export const codesRecordFile = (tournamentId: string) => `${STORAGE_DIR}/${tournamentId}.codes.json`;
export const legacyRecordFile = (tournamentId: string) => `${STORAGE_DIR}/${tournamentId}.tods.json`;

/** The stored file for a tournament: the `.codes.json` one when present, else a legacy `.tods.json`. */
export function existingRecordFile(tournamentId: string): string | undefined {
  return [codesRecordFile(tournamentId), legacyRecordFile(tournamentId)].find((file) => fs.existsSync(file));
}
