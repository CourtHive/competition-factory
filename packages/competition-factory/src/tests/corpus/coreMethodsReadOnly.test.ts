import { CORE_METHODS } from '../testHarness/corpus/coreMethods';
import { expect, it } from 'vitest';
import fs from 'fs';

// The schedule governor's `mutate` barrel carries queries and pure generators beside its mutations; harvested, they were
// recorded as steps with empty patches. They are excluded from the core set, and the mutations beside them are not.
const READ_ONLY = [
  'validateSchedulingProfile',
  'validateScheduleScenario',
  'findMatchUpFormatTiming',
  'generateVirtualCourts',
  'generateBookings',
  'proConflicts',
];

it('read-only exports of the schedule barrel are not core methods; its mutations are', () => {
  const barrel = fs.readFileSync('src/assemblies/governors/scheduleGovernor/mutate.ts', 'utf8');
  for (const name of READ_ONLY) {
    // still exported there, so the exclusion is not a stale name
    expect(barrel).toContain(name);
    expect(CORE_METHODS.has(name)).toEqual(false);
  }
  for (const name of ['scheduleProfileRounds', 'scheduleMatchUps', 'addMatchUpScheduleItems', 'bulkScheduleMatchUps'])
    expect(CORE_METHODS.has(name)).toEqual(true);
});
