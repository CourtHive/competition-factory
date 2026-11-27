import { resolveTieFormat } from '@courthive/competition-catalogue';
import { UUID } from '@Tools/UUID';

/**
 * A named catalogue tie format with a fresh collectionId on each collection: what a test that builds a tieFormat to
 * validate, compare or attach directly needs, since the catalogue's copies carry no ids. Loosely typed, as the tests
 * that take one reshape it.
 */
export function namedTieFormat(name: string): any {
  const tieFormat: any = resolveTieFormat(name);
  if (!tieFormat) throw new Error(`no catalogue tie format named ${name}`);
  for (const collectionDefinition of tieFormat.collectionDefinitions) collectionDefinition.collectionId = UUID();
  return tieFormat;
}
