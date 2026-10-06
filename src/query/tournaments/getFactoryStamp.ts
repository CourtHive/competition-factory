import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { extensionConstants } from '@Constants/extensionConstants';

// types
import type { Tournament } from '@Types/tournamentTypes';

const { FACTORY } = extensionConstants;

export type FactoryStamp = {
  /** the factory version that created the record; absent on records created before the stamp existed */
  createdVersion?: string;
  /** the factory version that last wrote the record */
  version?: string;
  /** the engine clock (`nowMs`) at that last write */
  timeStamp?: number;
};

/**
 * Which factory versions created and last wrote a tournament record.
 *
 * Reads the first-class `factory` attribute, or the `factory` extension that records written before CODES carry, so
 * historical records answer the same way. A field the record never stored is absent, never guessed: a record created
 * before `createdVersion` existed has no creator on file.
 */
export function getFactoryStamp({ tournamentRecord }: { tournamentRecord?: Tournament }): FactoryStamp {
  const value = firstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY });
  if (!value || typeof value !== 'object') return {};

  const stamp: FactoryStamp = {};
  if (typeof value.createdVersion === 'string') stamp.createdVersion = value.createdVersion;
  if (typeof value.version === 'string') stamp.version = value.version;
  if (typeof value.timeStamp === 'number') stamp.timeStamp = value.timeStamp;
  return stamp;
}

type ParsedVersion = { core: [number, number, number]; prerelease: boolean };

function parseVersion(version?: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(\+[\w.-]+)?$/.exec(version?.trim() ?? '');
  if (!match) return undefined;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: !!match[4] };
}

/** negative when `a` precedes `b`, positive when it follows, 0 when equal; undefined when either is not a version */
export function compareFactoryVersions(a?: string, b?: string): number | undefined {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return undefined;
  for (const index of [0, 1, 2]) {
    const difference = left.core[index] - right.core[index];
    if (difference) return difference;
  }
  // a prerelease precedes its release: 7.7.0-beta.1 < 7.7.0
  return Number(right.prerelease) - Number(left.prerelease);
}

/**
 * Whether a record was created (`stamp: 'created'`) or last written (`stamp: 'written'`, the default) by a factory
 * older than `version`.
 *
 * `undefined` means the record does not say: the stamp is missing or unreadable. A caller choosing behaviour by
 * threshold decides what unknown means for it; this never guesses.
 */
export function recordPredatesVersion({
  tournamentRecord,
  stamp = 'written',
  version,
}: {
  tournamentRecord?: Tournament;
  stamp?: 'created' | 'written';
  version: string;
}): boolean | undefined {
  const { createdVersion, version: writtenVersion } = getFactoryStamp({ tournamentRecord });
  const comparison = compareFactoryVersions(stamp === 'created' ? createdVersion : writtenVersion, version);
  return comparison === undefined ? undefined : comparison < 0;
}
