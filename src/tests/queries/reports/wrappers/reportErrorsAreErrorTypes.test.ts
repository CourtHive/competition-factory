import { generateReport } from '@Query/reports/generateReport';
import { expect, it } from 'vitest';

// constants
import { MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import {
  CALL_TIMING_VARIANCE_REPORT,
  COMPETITIVENESS_REPORT,
  MATCH_RESULTS_REPORT,
  MATCHUP_STATUS_REPORT,
  PARTICIPANT_RESULTS_REPORT,
} from '@Constants/reportConstants';

/**
 * A report that cannot read the record's matchUps refuses with an ErrorType — `{ message, code }`,
 * like every other factory error — not a bare string, so a caller can branch on `error.code`.
 *
 * A tournamentRecord that is present but not an object passes generateReport's presence check and
 * then yields no matchUps, which is the path these five reports refuse on.
 */
it.each([
  CALL_TIMING_VARIANCE_REPORT,
  PARTICIPANT_RESULTS_REPORT,
  COMPETITIVENESS_REPORT,
  MATCHUP_STATUS_REPORT,
  MATCH_RESULTS_REPORT,
])('the %s report refuses a record with no readable matchUps with an ErrorType', (reportId) => {
  const result: any = generateReport({ tournamentRecord: 'not a record' as any, reportId });
  expect(result.error).toEqual(MISSING_MATCHUPS);
  expect(result.error.code).toEqual(MISSING_MATCHUPS.code);
});
