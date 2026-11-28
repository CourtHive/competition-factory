import { tournamentEngine } from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// types
import type { MatchUpScheduleRequest } from '@Types/factoryTypes';

type ScheduleItemsParams = NonNullable<Parameters<typeof tournamentEngine.addMatchUpScheduleItems>[0]>;

// A type test: the scheduling calls take a numeric-string courtOrder (converted on write) together with the inputs only
// a scheduling call carries (allocatedCourts as ids or courts, courtIds, stopTime). It fails at check-types, not at run.
test('a schedule request takes a numeric-string courtOrder with the scheduling inputs', () => {
  const schedule: MatchUpScheduleRequest = {
    allocatedCourts: ['court-1', { courtId: 'court-2', venueId: 'venue-1' }],
    courtIds: ['court-1'],
    stopTime: '10:00',
    courtOrder: '2',
  };
  const params: ScheduleItemsParams = { matchUpId: 'matchUp-1', drawId: 'draw-1', schedule };
  expect(params.schedule).toBe(schedule);
});
