import { play, REFRESHED_ARRIVAL_CASES } from '@Tests/testHarness/outcome/directionFixtures';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

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
  it.each(REFRESHED_ARRIVAL_CASES)('%s', (_label, scenario, owned, status) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const before = getDifferentialTally()['shadow:applied']?.compared ?? 0;
    const exitBefore = getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0;
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect((getDifferentialTally()['shadow:applied']?.compared ?? 0) - before).toEqual(Number(owned));
    const step = scenario.steps[0];
    if (
      status === RETIRED &&
      step.outcome.winningSide === 2 &&
      step.params?.propagateExitStatus &&
      !scenario.policyDefinitions &&
      scenario.drawProfile.drawType !== SINGLE_ELIMINATION
    )
      expect((getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0) - exitBefore).toEqual(1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    expect(v2.v1Writes === 0).toEqual(owned);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
    if (owned && status !== COMPLETED)
      expect(v2.notices.some((notice) => notice.includes('"context":"refreshArrivals"'))).toEqual(true);
  });
});
