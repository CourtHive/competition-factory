import { codesRecordFile, legacyRecordFile, STORAGE_DIR } from './tournamentRecordFile';
import { removeTournamentRecords } from './removeTournamentRecords';
import { saveTournamentRecords } from './saveTournamentRecords';
import { findTournamentRecord } from './findTournamentRecord';
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';

// Unique ID to avoid file-level races with the other fileSystem specs
const TEST_ID = 'test-tournamentRecordFile';

const writeLegacy = (record: any) => {
  fs.ensureDirSync(STORAGE_DIR);
  fs.writeFileSync(legacyRecordFile(TEST_ID), JSON.stringify(record));
};

afterEach(async () => {
  await removeTournamentRecords({ tournamentId: TEST_ID });
});

describe('fileSystem record suffix: write .codes.json, still read .tods.json', () => {
  it('saves as .codes.json and reads it back', async () => {
    await saveTournamentRecords({ tournamentRecord: { tournamentId: TEST_ID, tournamentName: 'codes' } as any });
    expect(fs.existsSync(codesRecordFile(TEST_ID))).toEqual(true);
    expect(fs.existsSync(legacyRecordFile(TEST_ID))).toEqual(false);

    const result: any = await findTournamentRecord({ tournamentId: TEST_ID });
    expect(result.tournamentRecord.tournamentName).toEqual('codes');
  });

  it('finds a record stored under the legacy .tods.json suffix', async () => {
    writeLegacy({ tournamentId: TEST_ID, tournamentName: 'legacy' });
    expect(fs.existsSync(codesRecordFile(TEST_ID))).toEqual(false);

    const result: any = await findTournamentRecord({ tournamentId: TEST_ID });
    expect(result.tournamentRecord.tournamentName).toEqual('legacy');
  });

  it('a save replaces the legacy file, so the two can never disagree', async () => {
    writeLegacy({ tournamentId: TEST_ID, tournamentName: 'legacy' });
    await saveTournamentRecords({ tournamentRecord: { tournamentId: TEST_ID, tournamentName: 'saved' } as any });

    expect(fs.existsSync(legacyRecordFile(TEST_ID))).toEqual(false);
    const result: any = await findTournamentRecord({ tournamentId: TEST_ID });
    expect(result.tournamentRecord.tournamentName).toEqual('saved');
  });

  it('remove deletes a legacy file and counts it', async () => {
    writeLegacy({ tournamentId: TEST_ID });
    const result: any = await removeTournamentRecords({ tournamentId: TEST_ID });
    expect(result.removed).toEqual(1);
    expect(fs.existsSync(legacyRecordFile(TEST_ID))).toEqual(false);
    expect((await findTournamentRecord({ tournamentId: TEST_ID })).error).toEqual('Tournament not found');
  });
});
