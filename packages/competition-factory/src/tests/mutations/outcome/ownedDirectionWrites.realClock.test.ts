import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { SCENARIOS, play } from '@Tests/testHarness/outcome/directionFixtures';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';

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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.realClock.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

// The fixed clock gives every stamp one value, so a stamp the plan's ops leave out can still read equal: v2's apply
// announces the matchUp, and the notice stamps its structure. Under `differential` the shadow applies the ops alone,
// against v1's record, at real instants: a missing stamp op diverges there (S6 slice 10 met one)
describe('under differential with a real clock, every owned scenario compares whole', () => {
  it.each(SCENARIOS)('%s', (_label, scenario) => {
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { realClock: true });
    expect(compared.results.every((result: any) => result.success)).toEqual(true);
  });
});
