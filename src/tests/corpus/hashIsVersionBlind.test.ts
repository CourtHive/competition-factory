import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import { expect, it } from 'vitest';

/**
 * A corpus hash does not move with the factory's version. The checkpoint merging `dev` (7.1.0) into
 * `master` (7.4.0) failed `verify:corpus-manifest` on twelve scenarios for that alone, and every
 * release-please PR would have. The stamp's `version` is left out; anything else still moves the hash.
 */
const firstClass = (version: string, extra = {}) => ({
  tournamentId: 't',
  factory: { version, timeStamp: 1 },
  ...extra,
});
const legacy = (version: string) => ({
  tournamentId: 't',
  extensions: [
    { name: 'factory', value: { version, timeStamp: 1 } },
    { name: 'other', value: { version } },
  ],
});

it('ignores the factory stamp version, first-class or as an extension', () => {
  expect(canonicalHash(firstClass('7.1.0'))).toEqual(canonicalHash(firstClass('7.4.0')));
  expect(canonicalHash(legacy('7.1.0'))).not.toEqual(canonicalHash(legacy('7.4.0'))); // `other` still counts
  const legacyFactoryOnly = (version: string) => ({
    tournamentId: 't',
    extensions: [{ name: 'factory', value: { version, timeStamp: 1 } }],
  });
  expect(canonicalHash(legacyFactoryOnly('7.1.0'))).toEqual(canonicalHash(legacyFactoryOnly('7.4.0')));
});

it('still moves with everything else, the stamp timeStamp included', () => {
  expect(canonicalHash(firstClass('7.1.0'))).not.toEqual(canonicalHash(firstClass('7.1.0', { tournamentName: 'x' })));
  expect(canonicalHash({ ...firstClass('7.1.0'), factory: { version: '7.1.0', timeStamp: 2 } })).not.toEqual(
    canonicalHash(firstClass('7.1.0')),
  );
  // a version anywhere else in the record is data, not the stamp
  expect(canonicalHash({ tournamentId: 't', notes: { version: '1' } })).not.toEqual(
    canonicalHash({ tournamentId: 't', notes: { version: '2' } }),
  );
});
