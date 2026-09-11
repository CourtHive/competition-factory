import { transitionCertificationStatus } from '@Mutate/officiating/transitionCertificationStatus';
import { savePersonRequests } from '@Mutate/matchUps/schedule/scheduleMatchUps/personRequests/savePersonRequests';
import { generateTimeSlots } from '@Assemblies/generators/scheduling/generateTimeSlots';
import { getDailyLimit } from '@Query/extensions/getMatchUpDailyLimits';
import { getAvailableReports } from '@Query/reports/getAvailableReports';
import { address } from '@Assemblies/generators/mocks/address';
import { expect, it, describe } from 'vitest';

import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

// Single-statement guard coverage. Each target's coverage report shows exactly
// one uncovered statement: an early-return path that no other test exercises.

describe('getAvailableReports !tournamentRecord guard', () => {
  it('returns MISSING_TOURNAMENT_RECORD when tournamentRecord is undefined', () => {
    const result = getAvailableReports({ tournamentRecord: undefined as any });
    expect((result as any).error).toEqual(MISSING_TOURNAMENT_RECORD);
  });
});

describe('transitionCertificationStatus !officialRecord guard', () => {
  it('returns MISSING_OFFICIAL_RECORD when officialRecord is undefined', () => {
    const result = transitionCertificationStatus({
      officialRecord: undefined as any,
      certificationId: 'c1',
      toStatus: 'ACTIVE' as any,
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });
});

describe('savePersonRequests paramsCheck guard', () => {
  it('returns paramsCheck error when tournamentRecords missing', () => {
    const result: any = savePersonRequests({} as any);
    expect(result.error).toBeDefined();
  });
});

describe('generateTimeSlots paramsCheck guard', () => {
  it('returns paramsCheck error when courtDate missing', () => {
    const result: any = generateTimeSlots({} as any);
    expect(result.error).toBeDefined();
  });
});

describe('getDailyLimit paramCheck guard', () => {
  it('returns paramCheck error when tournamentRecord missing', () => {
    const result: any = getDailyLimit({});
    expect(result.error).toBeDefined();
  });
});

describe('address generator', () => {
  it('returns city/state/postalCode object', () => {
    const result = address();
    expect(result.city).toBeDefined();
    expect(result.state).toBeDefined();
    expect(result.postalCode).toBeDefined();
  });
});
