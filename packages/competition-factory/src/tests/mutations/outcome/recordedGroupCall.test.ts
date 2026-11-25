import { getProvider, setStateProvider, type Notice } from '@Global/state/globalState';
import { play, walkover, won } from '@Tests/testHarness/outcome/directionFixtures';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { storedGraph } from '@Tests/testHarness/outcome/objectGraph';
import { afterEach, describe, expect, it, vi } from 'vitest';

// constants and types
import { AD_HOC, ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import type { Scenario, Target } from '@Tests/testHarness/outcome/directionFixtures';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import type { AbstainReason } from '@Mutate/matchUps/outcome/types';
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

// CONTROL: with `refuse` set no recording is made, and the call's answer is the abstention its planners returned
const recorder = vi.hoisted(() => ({ refuse: false }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) =>
    recorder.refuse ? undefined : actual.recordWholeCall(args);
  return { ...actual, recordWholeCall };
});

/**
 * A RECORDING CARRIES A ROUND ROBIN GROUP'S OWN FIELDS (batch 4b, `outcome/plan/recordedDiff.ts` `drawStructures`). A
 * group is a structure of its own inside its container, and a result in it writes the group's tally among the group's
 * fields (`updateAssignmentParticipantResults`). The recorded ops name every structure of the draw, a group as its
 * container, so a call in a group that the planners abstain from is read off v1's whole write as any other; and the
 * abstention for a tally the planners do not write (`tallied`) is one a recording answers.
 *
 * Each row is first played with no recording, to show which abstention the planners return for it; then recorded: the
 * shadow is applied and compared under `differential`, and under `v2` v1 is not asked to write the stored record, which
 * is left as v1 leaves it object for object (`storedGraph`), with v1's notices and v1's result.
 */

afterEach(() => {
  recorder.refuse = false;
});

// a group's matchUps have no roundPosition: the nth of its first round
const RR = (nth: number, structureName?: string): Target => ({ roundNumber: 1, nth, structureName });
const ROUND_ROBIN_4 = { drawType: ROUND_ROBIN, drawSize: 4 };
const ROUND_ROBIN_8 = { drawType: ROUND_ROBIN, drawSize: 8 };
const AD_HOC_8 = { drawType: AD_HOC, drawSize: 8, automated: true, roundsCount: 2 };

const ROWS: [string, AbstainReason, Scenario][] = [
  [
    'a round robin result turned into a double walkover',
    'tallied',
    {
      drawProfile: ROUND_ROBIN_4,
      setup: [{ target: RR(0), outcome: won(1) }],
      steps: [{ target: RR(0), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'a round robin winner changed',
    'link',
    {
      drawProfile: ROUND_ROBIN_4,
      setup: [{ target: RR(0), outcome: won(1) }],
      steps: [{ target: RR(0), outcome: won(2) }],
    },
  ],
  [
    'a round robin winner changed, in the second of two groups',
    'link',
    {
      drawProfile: ROUND_ROBIN_8,
      setup: [
        { target: RR(0, 'Group 1'), outcome: won(1) },
        { target: RR(0, 'Group 2'), outcome: won(2) },
      ],
      steps: [{ target: RR(0, 'Group 2'), outcome: won(1) }],
    },
  ],
  [
    'a round robin walkover turned into a double walkover, where a playoff structure follows',
    'tallied',
    {
      drawProfile: { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 8 },
      setup: [{ target: RR(0, 'Group 2'), outcome: walkover(1) }],
      steps: [{ target: RR(0, 'Group 2'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'an ad hoc result turned into a double walkover',
    'tallied',
    {
      drawProfile: AD_HOC_8,
      setup: [{ target: RR(0), outcome: won(1) }],
      steps: [{ target: RR(0), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
];

const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};

describe('a call in a tallied structure the planners abstain from is recorded whole', () => {
  it.each(ROWS)('%s (%s)', (_label, reason, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const graph = storedGraph();
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);

    // CONTROL: the planners' own answer for the call
    const read = () => ({ abstained: tally(`shadow:abstain:${reason}`), applied: tally('shadow:applied') });
    const before = read();
    recorder.refuse = true;
    play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    recorder.refuse = false;
    expect(read()).toEqual({ abstained: before.abstained + 1, applied: before.applied });

    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(read()).toEqual({ abstained: before.abstained + 1, applied: before.applied + 1 });
    expect(storedGraph()).toEqual(graph);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(storedGraph()).toEqual(graph);
    expect(v2.v1Writes).toEqual(0);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});

it('records the subscribed deferred in-context notice through a forwarding provider in differential mode', () => {
  const previous = getProvider();
  let enqueued = 0;
  setStateProvider({
    ...previous,
    addNotice(notice: Notice, subscription?: boolean) {
      if (notice.topic === 'updateInContextMatchUp') enqueued++;
      return previous.addNotice(notice, subscription);
    },
  });
  try {
    const before = tally('shadow:applied');
    const result = play(OUTCOME_PIPELINE_DIFFERENTIAL, ROWS[0][2]);
    expect(enqueued).toBeGreaterThan(0);
    expect(result.notices.some((n) => n.startsWith('updateInContextMatchUp '))).toBe(true);
    expect(tally('shadow:applied')).toBe(before + 1);
    expect(result.results.every((r) => r.success)).toBe(true);
  } finally {
    setStateProvider(previous);
  }
});
