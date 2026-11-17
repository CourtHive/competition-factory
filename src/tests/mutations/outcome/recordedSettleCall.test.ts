import { CARRIED, MAIN, R1, cleared, play, walkover, won } from '@Tests/testHarness/outcome/directionFixtures';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { getTournamentRecords } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';
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

/**
 * the stored record and the cleared fixture as an object graph: every value, a key holding undefined, the keys in their
 * order, and WHICH objects are one object (an object met again is named by where it was first met)
 */
function objectGraph(root: unknown) {
  const met = new Map<object, number>();
  const visit = (value: unknown): unknown => {
    if (value === undefined) return { undefined: true };
    if (value === null || typeof value !== 'object') return value;
    if (met.has(value)) return { met: met.get(value) };
    met.set(value, met.size);
    return Object.entries(value).map(([key, held]) => [key, visit(held)]);
  };
  return visit(root);
}

const storedRecord = () => Object.values(getTournamentRecords())[0] as Tournament;

const storedGraph = () => objectGraph([toBePlayed.matchUpStatusCodes, toBePlayed.score, storedRecord()]);

const consolation = (roundPosition: number) =>
  storedRecord()
    .events![0].drawDefinitions![0].structures!.find((structure) => structure.structureName === 'Consolation')!
    .matchUps!.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition) as MatchUp;

describe("a call recorded whole leaves the objects v1's write leaves", () => {
  // Consolation 1/2 is played and cleared, and the clear leaves it the cleared fixture's status codes: one empty
  // array, shared by every matchUp so cleared (`modifyMatchUpScore`). Main 1/4 is then cleared: its loser leaves
  // Consolation 1/2, whose codes `removeDirectedLoser` derives afresh, a NEW empty array for the shared empty one.
  // Nothing Consolation 1/2 says is changed; the array that says it is another
  const SHARED_CODES: Scenario = {
    drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 },
    nonRandom: 7001,
    setup: [
      { target: R1(3, 'Main'), outcome: { winningSide: 1 } },
      { target: R1(4, 'Main'), outcome: { winningSide: 1 } },
      { target: R1(2, 'Consolation'), outcome: { winningSide: 1 } },
      { target: R1(2, 'Consolation'), outcome: cleared },
    ],
    steps: [{ target: R1(4, 'Main'), outcome: cleared }],
  };

  it('a new object that says what the old one said is the one stored', () => {
    play(OUTCOME_PIPELINE_V1, { ...SHARED_CODES, steps: [] });
    const before = JSON.stringify(consolation(2));
    expect(consolation(2).matchUpStatusCodes).toBe(toBePlayed.matchUpStatusCodes);

    const v1 = play(OUTCOME_PIPELINE_V1, SHARED_CODES);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    const graph = storedGraph();
    expect(JSON.stringify(consolation(2))).toEqual(before);
    expect(consolation(2).matchUpStatusCodes).toEqual([]);
    expect(consolation(2).matchUpStatusCodes).not.toBe(toBePlayed.matchUpStatusCodes);

    // CONTROL: the call is one the planners plan and a settle pass has work on, so it is recorded
    const settle = tally('shadow:abstain:settle');
    recorder.refuse = true;
    recorder.asked = 0;
    play(OUTCOME_PIPELINE_DIFFERENTIAL, SHARED_CODES);
    recorder.refuse = false;
    expect(recorder.asked).toEqual(1);
    expect(tally('shadow:abstain:settle')).toEqual(settle + 1);

    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      recorder.asked = 0;
      const actual = play(mode, SHARED_CODES);
      expect(recorder.asked).toEqual(1);
      if (mode === OUTCOME_PIPELINE_V2) expect(actual.v1Writes).toEqual(0);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(consolation(2).matchUpStatusCodes).not.toBe(toBePlayed.matchUpStatusCodes);
      expect(storedGraph()).toEqual(graph);
    }
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
