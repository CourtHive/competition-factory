import { generateTournamentRecord } from '../../../data/fileSystem/generateTournamentRecord';
import { removeTournamentRecords } from '../../../data/fileSystem/removeTournamentRecords';
import { executionQueue } from './executionQueue';

import { errorConditionConstants } from '@Constants/errorConditionConstants';

// Unique ID to avoid file-level race with queryTournamentRecords spec
const TEST_ID = 'test-executionQueue';

describe('executionQueue', () => {
  it('can generate a tournamentRecord', async () => {
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
    result = await executionQueue({
      executionQueue: [
        {
          params: {
            startDate: '2024-01-01',
            endDate: '2024-01-02',
            tournamentId: TEST_ID,
          },
          method: 'setTournamentDates',
        },
      ],
      tournamentIds: [TEST_ID, 'test2'],
    });
    expect(result.success).toEqual(true);

    // FOURTH: attempt to execute a directive on a tournamentRecord that does not exist
    result = await executionQueue({
      executionQueue: [{ method: 'setTournamentDates', params: { tournamentId: TEST_ID } }],
      tournamentIds: ['doesNotExist'],
    });
    expect(result.error).toEqual(errorConditionConstants.MISSING_TOURNAMENT_RECORD);
  });
});
