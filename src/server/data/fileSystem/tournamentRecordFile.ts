import { resolve, sep } from 'path';
import * as fs from 'fs-extra';

export const STORAGE_DIR = './src/data/fileSystem/storage';
const STORAGE_ROOT = resolve(STORAGE_DIR);

/**
 * A tournament's record file, or `undefined` when the id would place it anywhere but directly inside the
 * storage directory. `tournamentId` arrives from the caller, so `../../x` or `a/b` would otherwise read,
 * write or delete outside it (CodeQL js/path-injection, flagged since 2025 as #123 and again as #228-#233
 * once #5173 moved the path into this module).
 *
 * Two checks, in the forms CodeQL recognises as sanitisers (a `dirname(file) === root` comparison is just
 * as sound but it does not see it, and kept flagging the checkpoint): the id may hold no separator and no
 * `..`, and the resolved path must start with the storage root plus a separator.
 */
function recordFile(tournamentId: string, suffix: string): string | undefined {
  if (typeof tournamentId !== 'string' || !tournamentId) return undefined;
  if (tournamentId.includes('..') || tournamentId.includes('/') || tournamentId.includes('\\')) return undefined;
  const file = resolve(STORAGE_ROOT, `${tournamentId}${suffix}`);
  if (!file.startsWith(STORAGE_ROOT + sep)) return undefined;
  return file;
}

/** Records are written as CODES; `.tods.json` is the legacy suffix, still read so stored records load. */
export const codesRecordFile = (tournamentId: string) => recordFile(tournamentId, '.codes.json');
export const legacyRecordFile = (tournamentId: string) => recordFile(tournamentId, '.tods.json');

/** The stored file for a tournament: the `.codes.json` one when present, else a legacy `.tods.json`. */
export function existingRecordFile(tournamentId: string): string | undefined {
  return [codesRecordFile(tournamentId), legacyRecordFile(tournamentId)].find((file) => file && fs.existsSync(file));
}
