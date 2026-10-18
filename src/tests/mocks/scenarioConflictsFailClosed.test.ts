import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it, vi } from 'vitest';

// constants
import { CONFLICT_COURT_TIME_ORDER } from '@Constants/scheduleConstants';
import { MISSING_CONTEXT } from '@Constants/errorConditionConstants';

/**
 * A scenario places a deliberate conflict only on a matchUp proConflicts reports no issue for, so a detector
 * error must refuse the placement rather than read as "no issues" and place a conflict that may be masked.
 */
vi.mock('@Mutate/matchUps/schedule/schedulers/proScheduler/proConflicts', () => ({
  proConflicts: () => ({ error: MISSING_CONTEXT, info: 'detector refused' }),
}));

const DATE = '2026-06-01';

describe('a scenario conflict fails closed', () => {
  it('returns the detector error instead of placing the conflict', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'v1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawId: 'd1', drawSize: 16 }],
      schedulingProfile: [
        {
          scheduleDate: DATE,
          venues: [{ venueId: 'v1', rounds: [{ drawId: 'd1', roundNumber: 1 }] }],
        },
      ],
      scenarioProfile: {
        anchor: `${DATE}T09:00`,
        assignCourts: true,
        conflicts: [{ type: CONFLICT_COURT_TIME_ORDER }],
      },
      autoSchedule: true,
      nonRandom: 11,
      startDate: DATE,
      endDate: DATE,
    });
    expect(result.success).toBeUndefined();
    expect(result.error).toEqual(MISSING_CONTEXT);
  });
});
