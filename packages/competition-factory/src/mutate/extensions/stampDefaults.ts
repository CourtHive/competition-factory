import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { defaultsHash, defaultsHashes } from '@Fixtures/policies/defaultsHash';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { extensionConstants } from '@Constants/extensionConstants';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { nowMs } from '@Tools/clock';

// types
import type { Tournament } from '@Types/tournamentTypes';

const { FACTORY } = extensionConstants;

/**
 * Writes the defaults stamp into a tournament record's `factory` stamp when it carries none, and keeps every other
 * field of the stamp. A stamp already on file is history and is never replaced: it says which defaults the record
 * first relied on, which is what `getDefaultsDrift` compares with the running factory's.
 *
 * The stamp is two build-time constants: `defaultsHash` and the frozen `defaultsHashes`, shared by reference (a copy
 * of a record copies it). Nothing is hashed here.
 */
export function stampDefaultsIfAbsent(tournamentRecord?: Tournament): boolean {
  if (!tournamentRecord || typeof tournamentRecord !== 'object') return false;
  // the common case, read first: a record created with the stamp carries it on its first-class attribute
  if (typeof tournamentRecord.factory?.defaultsHash === 'string') return false;
  const existing = firstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY });
  if (typeof existing?.defaultsHash === 'string') return false;
  const value =
    existing && typeof existing === 'object'
      ? { ...existing, defaultsHash, defaultsHashes }
      : { defaultsHash, defaultsHashes };
  return !setFirstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY, value }).error;
}

/**
 * The stamp of a tournament record built outside `createTournamentRecord` (activation from sanctioning): the creating
 * factory, on file from the start, and the defaults the record relies on for every policy type it does not pin. A
 * `factory` the record already carries is history and is kept as given, never backfilled.
 */
export function stampCreation(record: Partial<Tournament>): void {
  if (firstClassOrExtension({ element: record, attribute: 'factory', name: FACTORY })) return;
  const version = factoryVersion();
  setFirstClassOrExtension({
    value: { createdVersion: version, version, timeStamp: nowMs(), defaultsHash, defaultsHashes },
    element: record,
    attribute: 'factory',
    name: FACTORY,
  });
}
