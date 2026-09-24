import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';
import fs from 'fs-extra';

/**
 * To reproduce use cases:
 * Paste snapshot of tournamentRecord into co-located tournament.tods.json file
 * Capture { method, params } and paste into methods array
 */

test.skip('can execute arbitrary methods', () => {
  const tournamentRecordJSON = fs.readFileSync('src/tests/harness/tournament.tods.json', 'utf-8');
  const tournamentRecord = JSON.parse(tournamentRecordJSON);
  let result = tournamentEngine.devContext(true).setState(tournamentRecord, false);
  expect(result.success).toEqual(true);

  // START: preMutation
  // END: preMutation

  const methods = [];
  result = tournamentEngine.executionQueue(methods);
  console.log(result);

  // START: postMutation
  // END: postMutation
});
