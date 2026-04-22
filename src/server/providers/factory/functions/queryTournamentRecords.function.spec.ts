import { generateTournamentRecord } from '../../../data/fileSystem/generateTournamentRecord';
import { removeTournamentRecords } from '../../../data/fileSystem/removeTournamentRecords';
import { queryTournamentRecords } from './queryTournamentRecords';

// Unique ID to avoid file-level race with executionQueue spec
const TEST_ID = 'test-queryTournamentRecords';

describe('queryTournamentRecords', () => {
  it('can query a tournamentRecord', async () => {
    // FIRST: remove any existing tournamentRecord with this tournamentId
    let result: any = await removeTournamentRecords({ tournamentId: TEST_ID });
    expect(result.success).toEqual(true);

    // SECOND: generate a tournamentRecord with this tournamentId and persist to storage
    result = generateTournamentRecord({
      tournamentAttributes: { tournamentId: TEST_ID },
      drawProfiles: [{ drawSize: 16 }],
    });
    expect(result.success).toEqual(true);

    // THIRD: execute a directive on the tournamentRecord
    result = await queryTournamentRecords({
      params: { tournamentId: TEST_ID },
      method: 'getTournamentInfo',
      tournamentId: TEST_ID,
    });
    expect(result.success).toEqual(true);
  });
});
