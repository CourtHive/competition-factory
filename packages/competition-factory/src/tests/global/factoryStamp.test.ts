import { compareFactoryVersions, getFactoryStamp, recordPredatesVersion } from '@Query/tournaments/getFactoryStamp';
import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { legacyMode } from '@Tests/testHarness/legacyMode';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

/**
 * A TOURNAMENT RECORD CARRIES THE FACTORY VERSIONS THAT CREATED AND LAST WROTE IT (CA, 2026-10-06).
 *
 * `factory = { createdVersion, version, timeStamp }`: `createdVersion` is written once, at creation; every write
 * refreshes `version` and `timeStamp` and keeps `createdVersion`. Records created before the stamp have no creator on
 * file and none is backfilled. `getFactoryStamp` reads the first-class attribute or the historical `factory` extension
 * alike, so a factory method can later choose behaviour by version threshold (`recordPredatesVersion`).
 */

const CLOCK = Date.UTC(2026, 9, 6, 12);
afterEach(() => setClock());

it('a new record is stamped with the creating factory, on the engine clock', () => {
  setClock(CLOCK);
  tournamentEngine.newTournamentRecord({ startDate: '2026-10-06', endDate: '2026-10-07' });
  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.factory).toEqual({
    createdVersion: factoryVersion(),
    version: factoryVersion(),
    timeStamp: CLOCK,
  });
  expect(getFactoryStamp({ tournamentRecord })).toEqual(tournamentRecord.factory);
});

it('a generated record is stamped the same way', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  expect(getFactoryStamp({ tournamentRecord }).createdVersion).toEqual(factoryVersion());
});

it('a write refreshes version and timeStamp and keeps the creator', () => {
  tournamentEngine.newTournamentRecord({ startDate: '2026-10-06', endDate: '2026-10-07' });
  const created = tournamentEngine.getTournament().tournamentRecord;
  // an older factory created and last wrote it
  created.factory = { createdVersion: '7.0.0', version: '7.1.0', timeStamp: 1 };
  tournamentEngine.setState(created);

  setClock(CLOCK);
  const result: any = tournamentEngine.addEvent({ event: { eventName: 'Stamped' } });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(getFactoryStamp({ tournamentRecord })).toEqual({
    createdVersion: '7.0.0',
    version: factoryVersion(),
    timeStamp: CLOCK,
  });
});

it('a write to a record created before the stamp leaves its creator unknown', () => {
  tournamentEngine.newTournamentRecord({ startDate: '2026-10-06', endDate: '2026-10-07' });
  const created = tournamentEngine.getTournament().tournamentRecord;
  created.factory = { version: '6.2.0', timeStamp: 1 };
  tournamentEngine.setState(created);

  tournamentEngine.addEvent({ event: { eventName: 'Stamped' } });
  const stamp = getFactoryStamp({ tournamentRecord: tournamentEngine.getTournament().tournamentRecord });
  expect(stamp.version).toEqual(factoryVersion());
  expect(stamp.createdVersion).toBeUndefined();
});

it('a factory the caller supplies at creation is kept as given', () => {
  const tournamentRecord = createTournamentRecord({ factory: { version: '6.0.0' } });
  expect(tournamentRecord.factory).toEqual({ version: '6.0.0' });
});

it('a historical record answers from its factory extension', () => {
  const tournamentRecord = {
    tournamentId: 'historical',
    extensions: [{ name: 'factory', value: { version: '2.2.4', timeStamp: 1700000000000 } }],
  };
  expect(getFactoryStamp({ tournamentRecord })).toEqual({ version: '2.2.4', timeStamp: 1700000000000 });
  expect(recordPredatesVersion({ tournamentRecord, version: '7.7.0' })).toEqual(true);
  expect(recordPredatesVersion({ tournamentRecord, version: '2.2.4' })).toEqual(false);
  // no creator on file: the record does not say
  expect(recordPredatesVersion({ tournamentRecord, version: '7.7.0', stamp: 'created' })).toBeUndefined();
});

it('a record with no stamp, or an unreadable one, says nothing', () => {
  expect(getFactoryStamp({ tournamentRecord: { tournamentId: 'bare' } as any })).toEqual({});
  expect(getFactoryStamp({ tournamentRecord: undefined })).toEqual({});
  const garbled: any = { tournamentId: 'garbled', factory: { version: 7, createdVersion: 'seven', timeStamp: 'now' } };
  expect(getFactoryStamp({ tournamentRecord: garbled })).toEqual({ createdVersion: 'seven' });
  expect(recordPredatesVersion({ tournamentRecord: garbled, version: '7.7.0' })).toBeUndefined();
  expect(recordPredatesVersion({ tournamentRecord: garbled, version: '7.7.0', stamp: 'created' })).toBeUndefined();
});

it('versions compare numerically, and a prerelease precedes its release', () => {
  expect(compareFactoryVersions('7.10.0', '7.9.9')).toBeGreaterThan(0);
  expect(compareFactoryVersions('7.6.0', '7.7.0')).toBeLessThan(0);
  expect(compareFactoryVersions('v7.7.0', '7.7.0')).toEqual(0);
  expect(compareFactoryVersions('7.7.0-beta.1', '7.7.0')).toBeLessThan(0);
  expect(compareFactoryVersions('7.7.0', '7.7.0-beta.1')).toBeGreaterThan(0);
  expect(compareFactoryVersions('7.7.0+build.5', '7.7.0')).toEqual(0);
  expect(compareFactoryVersions('7.7', '7.7.0')).toBeUndefined();
  expect(compareFactoryVersions(undefined, '7.7.0')).toBeUndefined();
});

legacyMode('the creation stamp follows the write mode', () => {
  it('is written to the factory extension, and read back the same', () => {
    const tournamentRecord = createTournamentRecord({});
    expect(tournamentRecord.factory).toBeUndefined();
    const extension = tournamentRecord.extensions.find((candidate: any) => candidate.name === 'factory');
    expect(extension.value.createdVersion).toEqual(factoryVersion());
    expect(getFactoryStamp({ tournamentRecord }).createdVersion).toEqual(factoryVersion());
  });
});
