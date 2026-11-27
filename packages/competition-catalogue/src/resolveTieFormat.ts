import { tieFormats } from './tieFormats';

// types
import type { TieFormat } from '@Types/tournamentTypes';

/**
 * A copy of the named tie format, ready to pass as `tieFormat` to `addEvent`, `generateDrawDefinition`,
 * `generateEventsFromTieFormat` or a mocksEngine profile. The copy carries no `collectionId`s: they identify a
 * collection within one record, and the engine mints them when the format is used. Returns `undefined` for a name
 * the catalogue does not hold.
 */
export function resolveTieFormat(name: string): TieFormat | undefined {
  if (!Object.hasOwn(tieFormats, name)) return undefined;
  const tieFormat = JSON.parse(JSON.stringify(tieFormats[name as keyof typeof tieFormats]));
  for (const collectionDefinition of tieFormat.collectionDefinitions ?? []) delete collectionDefinition.collectionId;
  return tieFormat;
}
