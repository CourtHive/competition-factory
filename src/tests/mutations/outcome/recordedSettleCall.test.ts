import { CARRIED, MAIN, R1, play, walkover, won } from '@Tests/testHarness/outcome/directionFixtures';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { afterEach, describe, expect, it, vi } from 'vitest';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

// counts v1's matchUp writes on the stored record (`directionCounter.ts`: a write to a recorded call's copy is not one)
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

// CONTROL: with `refuse` set no recording is made, and the call's answer is the one its planners returned
const recorder = vi.hoisted(() => ({ refuse: false, asked: 0 }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args, view) => {
    recorder.asked += 1;
    return recorder.refuse ? undefined : actual.recordWholeCall(args, view);
  };
  return { ...actual, recordWholeCall };
});

// every working view a call folds its ops into (`overlay.ts`)
const folds = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/outcome/overlay', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/overlay')>();
  const createWorkingView: typeof actual.createWorkingView = (args) => {
    folds.count += 1;
    return actual.createWorkingView(args);
  };
  return { ...actual, createWorkingView };
});

/**
 * A CALL WHOSE PLANNED OPS LEAVE SETTLE WORK IS RECORDED WHOLE (`outcome/plan.ts` `recordedWhole`). The planners plan
 * the call, a settle predicate finds work on the working view their ops leave, and the call would abstain `settle`:
 * it is read off v1's whole write on a copy of the record instead, as a call the planners abstain from is.
 *
 * The question is asked of every plan (`settles`), and the fold that answers it is the call's one fold: `finalizePlan`
 * takes the working view and the sites it read (`decide.ts` `settleFolds`).
 */

afterEach(() => {
  recorder.refuse = false;
});

const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};

const MAIN_ROUND_1: Scenario['steps'] = [1, 2, 3, 4].map((roundPosition) => ({
  target: R1(roundPosition, 'Main'),
  outcome: won(1),
}));

// a second-round Main loser has won before and is kept out of the Consolation, whose first round is played: the exit
// propagates, so every settle pass is in reach of the ops the planners write (`predictSettleWork`)
const KEPT_OUT_CARRIED: Scenario = {
  drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 },
  setup: [
    ...MAIN_ROUND_1,
    { target: R1(1, 'Consolation'), outcome: won(1) },
    { target: R1(2, 'Consolation'), outcome: won(1) },
  ],
  steps: [{ target: MAIN(2, 1), outcome: walkover(1), params: CARRIED }],
};

describe('a call whose planned ops leave settle work', () => {
  it("is read off v1's whole write, and is v2s", () => {
    const v1 = play(OUTCOME_PIPELINE_V1, KEPT_OUT_CARRIED);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);

    // CONTROL: with no recording the planners' ops are the plan, and a settle pass has work on what they leave
    const read = () => ({ settle: tally('shadow:abstain:settle'), applied: tally('shadow:applied') });
    const before = read();
    recorder.refuse = true;
    recorder.asked = 0;
    play(OUTCOME_PIPELINE_DIFFERENTIAL, KEPT_OUT_CARRIED);
    recorder.refuse = false;
    expect(recorder.asked).toEqual(1);
    expect(read()).toEqual({ settle: before.settle + 1, applied: before.applied });

    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, KEPT_OUT_CARRIED);
    expect(read()).toEqual({ settle: before.settle + 1, applied: before.applied + 1 });
    const v2 = play(OUTCOME_PIPELINE_V2, KEPT_OUT_CARRIED);
    expect(v2.v1Writes).toEqual(0);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });

  it('stays the call it was where the recording is not made: no fold more, and v1 writes it', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, KEPT_OUT_CARRIED);
    recorder.refuse = true;
    folds.count = 0;
    const v2 = play(OUTCOME_PIPELINE_V2, KEPT_OUT_CARRIED);
    // the planners' own fold of the kept-out seat, and the plan's: the fold `settles` asked of the planned ops is the
    // one `finalizePlan` reads the settle work from
    expect(folds.count).toEqual(2);
    expect(v2.v1Writes).toEqual(v1.v1Writes);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('a call whose planned ops settle clean', () => {
  const FIRST_WINNER: Scenario = { drawProfile: { drawSize: 8 }, steps: [{ target: R1(1), outcome: won(1) }] };

  it('is asked for no recording, and is folded once', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, FIRST_WINNER);
    recorder.asked = 0;
    folds.count = 0;
    const v2 = play(OUTCOME_PIPELINE_V2, FIRST_WINNER);
    expect(recorder.asked).toEqual(0);
    // `settles` is asked of the plan, and `finalizePlan` takes the fold that answered it
    expect(folds.count).toEqual(1);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});
