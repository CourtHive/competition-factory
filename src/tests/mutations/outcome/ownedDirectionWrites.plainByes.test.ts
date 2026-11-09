import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import {
  retired,
  CARRIED,
  R1,
  play,
  PENDING_WINNERS,
  pendingWinnerIsOwned,
  PLAIN_BYE_ARRIVALS,
  plainByeIsOwned,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { COMPASS } from '@Constants/drawDefinitionConstants';
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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.plainByes.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C20 a plain loser goes on through a BYE chain or a last-round BYE', () => {
  it.each(PLAIN_BYE_ARRIVALS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      cascade: getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    const owned = plainByeIsOwned(scenario);
    expect(tally()).toEqual({ applied: before.applied + Number(owned), cascade: before.cascade + Number(!owned) });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes === 0).toEqual(owned);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('C20 previously deferred BYE arrivals', () => {
  it('C20: a retirement carrying no exit sends its loser through two BYEs', () => {
    // COMPASS 16/10: a retirement the policy does not propagate is directed as played; its loser goes on through two BYEs
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: COMPASS },
      steps: [{ target: R1(2, 'East'), outcome: retired(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('C20 the pending-exit winner whose loser passes a last-round BYE', () => {
  it.each(PENDING_WINNERS.filter(([, scenario]) => !pendingWinnerIsOwned(scenario) && !scenario.policyDefinitions))(
    '%s',
    (_label, scenario) => {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      expect(v2.v1Writes).toEqual(0);
      for (const actual of [compared, v2]) {
        expect(actual.results).toEqual(v1.results);
        expect(actual.record).toEqual(v1.record);
        expect(actual.notices).toEqual(v1.notices);
      }
    },
  );
});
