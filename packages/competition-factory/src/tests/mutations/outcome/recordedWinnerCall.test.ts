import { expectRecordedWhole, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { findTarget, MAIN, R1, won } from '@Tests/testHarness/outcome/directionFixtures';
import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import { AWAITING_RESULT, COMPLETED, INCOMPLETE, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { Target } from '@Tests/testHarness/outcome/directionFixtures';
import { OUTCOME_PIPELINE_V1 } from '@Tests/testHarness/outcomeModes';

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

afterEach(() => {
  recorder.refuse = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

/**
 * A STORED WINNER TAKEN AWAY BY A CALL THAT NAMES NONE IS RECORDED WHOLE (`winner`, `outcome/plan.ts` `RECORDED_WHOLE`).
 *
 * The planners plan a winner entered again, changed, swapped, or cleared with its status (`remove-directed`). What is
 * left abstains `winner`: a decided result re-scored as unfinished (IN_PROGRESS, INCOMPLETE, AWAITING_RESULT: v1 takes
 * the winner back out of the next matchUp, `existing-winner-removed`), and a decided result corrected to a tie its
 * format permits (COMPLETED with no winner, `apply-values`). All of it is v1's write in the draw: the matchUp's own
 * fields, the next matchUp's position, a group's tally.
 */

const partial = { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] };
const draw = (drawProfile: Record<string, unknown>) =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
const score = (target: Target, outcome: Record<string, unknown>) =>
  expect(
    tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: findTarget(target), outcome: structuredClone(outcome) })
      .success,
  ).toEqual(true);

/** a decided first-round result of an elimination draw, its winner standing in the next round */
const decided = (outcome: Record<string, unknown>) => () => {
  draw({ drawType: SINGLE_ELIMINATION, drawSize: 8 });
  score(R1(1), won(1));
  return { drawId: 'd', matchUpId: findTarget(R1(1)), outcome };
};

const ROWS: [string, () => Record<string, unknown>][] = [
  ['re-scored as in progress', decided({ matchUpStatus: IN_PROGRESS, score: partial })],
  ['re-scored as incomplete', decided({ matchUpStatus: INCOMPLETE, score: partial })],
  ['set back to awaiting its result', decided({ matchUpStatus: AWAITING_RESULT })],
  [
    'a final re-scored as incomplete',
    () => {
      draw({ drawType: SINGLE_ELIMINATION, drawSize: 4 });
      for (const target of [R1(1), R1(2), MAIN(2, 1)]) score(target, won(1));
      return { drawId: 'd', matchUpId: findTarget(MAIN(2, 1)), outcome: { matchUpStatus: INCOMPLETE, score: partial } };
    },
  ],
  [
    'a round robin result corrected to a tie its format permits',
    () => {
      draw({ drawType: ROUND_ROBIN, drawSize: 4, matchUpFormat: 'SET1-S:P32' });
      const target = { roundNumber: 1, nth: 0 };
      score(target, {
        score: { sets: [{ setNumber: 1, side1Score: 17, side2Score: 15, winningSide: 1 }] },
        matchUpStatus: COMPLETED,
        winningSide: 1,
      });
      return {
        outcome: { matchUpStatus: COMPLETED, score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } },
        matchUpId: findTarget(target),
        drawId: 'd',
      };
    },
  ],
];

describe('a stored winner taken away by a call that names none is recorded whole', () => {
  it.each(ROWS)('a decided result %s', (_label, build) => {
    const call = prepareCall(build);
    const v1 = expectRecordedWhole(call, 'winner', recorder);
    // the winner is gone from the stored matchUp
    const stored = JSON.parse(v1.record)
      .events[0].drawDefinitions[0].structures.flatMap((structure: any) => [
        ...(structure.matchUps ?? []),
        ...(structure.structures ?? []).flatMap((group: any) => group.matchUps ?? []),
      ])
      .find((matchUp: any) => matchUp.matchUpId === call.params.matchUpId);
    expect(stored.winningSide).toBeUndefined();
  });
});
