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
 * The defaults stamp: which engine defaults a record relies on for every policy type it does not pin. Two build-time
 * constants, copied; nothing is hashed here.
 */
export function defaultsStamp(): { defaultsHash: string; defaultsHashes: { [policyType: string]: string } } {
  return { defaultsHash, defaultsHashes: { ...defaultsHashes } };
}

/**
 * Writes the defaults stamp into a tournament record's `factory` stamp when it carries none, and keeps every other
 * field of the stamp. A stamp already on file is history and is never replaced: it says which defaults the record
 * first relied on, which is what `getDefaultsDrift` compares with the running factory's.
 */
export function stampDefaultsIfAbsent(tournamentRecord?: Tournament): boolean {
  if (!tournamentRecord || typeof tournamentRecord !== 'object') return false;
  const existing = firstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY });
  if (typeof existing?.defaultsHash === 'string') return false;
  const value = existing && typeof existing === 'object' ? { ...existing, ...defaultsStamp() } : defaultsStamp();
  return !setFirstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY, value }).error;
}

/**
 * The stamp of a new tournament record: the creating factory, on file from the start (every later write refreshes
 * `version` and keeps `createdVersion`), and the defaults the record relies on for every policy type it does not pin.
 * A `factory` the record already carries is history and is kept as given, never backfilled.
 */
export function stampCreation(record: Partial<Tournament>): void {
  if (firstClassOrExtension({ element: record, attribute: 'factory', name: FACTORY })) return;
  const version = factoryVersion();
  setFirstClassOrExtension({
    value: { createdVersion: version, version, timeStamp: nowMs(), ...defaultsStamp() },
    element: record,
    attribute: 'factory',
    name: FACTORY,
  });
}
