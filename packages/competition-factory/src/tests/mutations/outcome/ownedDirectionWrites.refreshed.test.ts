import { play, REFRESHED_ARRIVAL_CASES } from '@Tests/testHarness/outcome/directionFixtures';
import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.refreshed.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C23 relabelled arrival origins retain exact records and notice identities', () => {
  it.each(REFRESHED_ARRIVAL_CASES)('%s', (_label, scenario, owned, status, planned) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v2.v1Writes === 0).toEqual(owned);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
    // a call recorded whole announces as v1 does: only the planners' own refresh names itself
    if (planned && status !== COMPLETED)
      expect(v2.notices.some((notice) => notice.includes('"context":"refreshArrivals"'))).toEqual(true);
  });
});
