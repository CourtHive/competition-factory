import * as path from 'path';
import * as fs from 'fs-extra';

export const STORAGE_DIR = './src/data/fileSystem/storage';
const STORAGE_ROOT = path.resolve(STORAGE_DIR);

/**
 * A tournament's record file, or `undefined` when the id would place it anywhere but directly inside the
 * storage directory. `tournamentId` arrives from the caller, so `../../x` or `a/b` would otherwise read,
 * write or delete outside it (CodeQL js/path-injection, flagged since 2025 as #123 and again as #228-#231
 * once #5173 moved the path into this module). The path is resolved first and its directory compared,
 * so no spelling of a separator or `..` can escape.
 */
function recordFile(tournamentId: string, suffix: string): string | undefined {
  if (typeof tournamentId !== 'string' || !tournamentId) return undefined;
  const file = path.resolve(STORAGE_ROOT, `${tournamentId}${suffix}`);
  return path.dirname(file) === STORAGE_ROOT ? file : undefined;
}

/** Records are written as CODES; `.tods.json` is the legacy suffix, still read so stored records load. */
export const codesRecordFile = (tournamentId: string) => recordFile(tournamentId, '.codes.json');
export const legacyRecordFile = (tournamentId: string) => recordFile(tournamentId, '.tods.json');

/** The stored file for a tournament: the `.codes.json` one when present, else a legacy `.tods.json`. */
export function existingRecordFile(tournamentId: string): string | undefined {
  return [codesRecordFile(tournamentId), legacyRecordFile(tournamentId)].find((file) => file && fs.existsSync(file));
}
