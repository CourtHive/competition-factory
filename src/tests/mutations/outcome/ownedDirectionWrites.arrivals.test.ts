import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import {
  won,
  cleared,
  MAIN,
  play,
  consolationRecord,
  W2_9100153,
  STANDING_AWARDS,
  PRODUCED_PENDING,
  PENDING_WINNERS,
  pendingWinnerIsOwned,
  GENERATED_PENDING_WINNERS,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.arrivals.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C17 a cleared Main final whose loser a link fed is v2s (decision 5; ruling 10 found the shape)', () => {
  // `removalOps` emits a final's loser leg alone, as `resultToDoubleExit` needs; until C17 `removedOps` guarded a final
  // out before it, and that empty plan left the fed seat occupied, which the settle check abstained on. The guard is
  // gone: v1's `removeDirectedLoser` clears the seat and announces the consolation matchUp, and v2 plans the same.
  it('FIC 8, Main played out, the final cleared: v2 owns it, and leaves exactly what v1 leaves', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [MAIN(1, 1), MAIN(1, 2), MAIN(1, 3), MAIN(1, 4), MAIN(2, 1), MAIN(2, 2), MAIN(3, 1)].map((target) => ({
        target,
        outcome: won(1),
      })),
      steps: [{ target: MAIN(3, 1), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      settle: getDifferentialTally()['shadow:abstain:settle']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, settle: before.settle });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('C16 the loser beside an opponent BYE goes on through the chain to the landing the unwind writes back', () => {
  it('census w2 9100153 (FRLC 16/11, policy off): v2 owns Main 1/4 given a winner and leaves exactly what v1 leaves', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, W2_9100153);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    // the landing as v1 leaves it: Consolation 3/1 to be played, the loser's position standing in it alone
    const consolation = consolationRecord(v1.record)[0].matchUps;
    const landing = consolation.find((matchUp: any) => matchUp.roundNumber === 3 && matchUp.roundPosition === 1);
    expect(landing.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(landing.drawPositions).toEqual([4]);
    expect(landing.sideExitProvenance).toBeUndefined();
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      exit: getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, W2_9100153);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, exit: before.exit });
    const v2 = play(OUTCOME_PIPELINE_V2, W2_9100153);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('C18 the loser arriving where a carried exit stands awarded to their seat takes it and goes on', () => {
  it.each(STANDING_AWARDS)('%s', (_label, scenario) => {
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
    expect(tally()).toEqual({ applied: before.applied + 1, cascade: before.cascade });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
  it.each(PRODUCED_PENDING)('%s: a produced exit pending is not a standing award, v1s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const deferred = () => getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0;
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(deferred()).toEqual(before + 1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
  });
});

describe('C19 a winner arrives at a pending produced exit', () => {
  it.each([...PENDING_WINNERS.filter(([, scenario]) => pendingWinnerIsOwned(scenario)), ...GENERATED_PENDING_WINNERS])(
    '%s',
    (_label, scenario) => {
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
      expect(tally()).toEqual({ applied: before.applied + 1, cascade: before.cascade });
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      expect(v2.v1Writes).toEqual(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
      expect(v2.notices).toEqual(v1.notices);
    },
  );
});

describe('C19 controls: the loser also meets a pending produced exit', () => {
  it.each(PENDING_WINNERS.filter(([, scenario]) => !pendingWinnerIsOwned(scenario) && !!scenario.policyDefinitions))(
    '%s stays v1s',
    (_label, scenario) => {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      const deferred = () => getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0;
      const before = deferred();
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
      expect(deferred()).toEqual(before + 1);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      expect(v2.v1Writes).toBeGreaterThan(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
      expect(v2.notices).toEqual(v1.notices);
    },
  );
});
