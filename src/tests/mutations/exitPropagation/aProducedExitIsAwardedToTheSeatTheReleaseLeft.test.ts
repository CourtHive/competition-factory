import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { DOUBLE_WALKOVER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A PRODUCED EXIT IS AWARDED TO THE SEAT THE RELEASE LEFT, NOT THE ONE IT EMPTIED (punch-list P60).
 *
 * DOUBLE_ELIMINATION 8/6 under `doubleExitPropagateBye: false`. Census F2 fixture seed 20506968 (30 steps, shrunk here
 * to 5) and DE window seed 9301858 (its first 9 steps): the only two schedules, of every census window and both
 * census-fail sets replayed under that policy, on which the harness rule WINNING_SIDE_EMPTY fires before this fix.
 *
 * `Main|1|2` is a double walkover and `Main|3|1` an exit, so the Main winner waits in `Main|4|1` and the Backdraw final
 * holds the `Main|3|1` loser carrying their exit. Re-scoring `Main|1|3` as a walkover sends its loser down carrying
 * one too: it meets the produced exit in `Backdraw|3|1`, both Backdraw matchUps above become double walkovers, and the
 * Backdraw finalist is taken back out of the Main final across the link. That leaves the Main winner alone there,
 * on the other side. The Backdraw final's produced WALKOVER was then awarded from the draw as it stood before the
 * release, to side 1, now empty: the final read WALKOVER won by nobody, and stayed so until a later result rewrote it.
 *
 * The recursion that sends the convergence's exit on now decides it on the draw the hop left.
 */

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const config = (seed: number) => ({
  drawType: 'DOUBLE_ELIMINATION',
  propagateExitStatus: true,
  participantsCount: 6,
  drawSize: 8,
  seed,
});
const step = (roundNumber: number, roundPosition: number, outcome: any) => ({
  structureName: 'Main',
  roundPosition,
  roundNumber,
  outcome,
});
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' };

const SCHEDULES = [
  {
    seed: 20506968,
    steps: [
      step(1, 3, { winningSide: 2 }),
      step(2, 2, { matchUpStatus: WALKOVER, winningSide: 1 }),
      step(1, 2, { matchUpStatus: DOUBLE_WALKOVER }),
      step(3, 1, { matchUpStatus: WALKOVER, winningSide: 1 }),
      step(1, 3, { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
  },
  {
    seed: 9301858,
    steps: [
      step(1, 2, { matchUpStatus: WALKOVER, winningSide: 1 }),
      step(1, 3, CLEAR),
      step(1, 3, { winningSide: 2 }),
      step(1, 2, CLEAR),
      step(2, 2, { matchUpStatus: WALKOVER, winningSide: 2 }),
      step(1, 2, CLEAR),
      step(1, 2, { matchUpStatus: DOUBLE_WALKOVER }),
      step(3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }),
      step(1, 3, { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
  },
];

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it.each(SCHEDULES)('seed $seed: the Main final is won by the finalist standing in it', ({ seed, steps }) => {
  setSubscriptions({});
  delete process.env.ALLOW_CHANGE_PROPAGATION;
  const drawId = `p60-${seed}`;
  expect(prepareDraw(config(seed), drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];

  let last: any;
  for (const { outcome, ...at } of steps) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === coordinate(at));
    last = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, drawId, outcome });
    expect(last.thrown).toBeUndefined();
    expect(last.invariantViolations.filter((violation: any) => violation.rule === 'WINNING_SIDE_EMPTY')).toEqual([]);
  }
  expect(last.error).toBeUndefined();

  // the correction made both Backdraw matchUps above it double walkovers, so nobody comes across the link
  const byCoordinate = new Map(matchUps().map((matchUp) => [coordinate(matchUp), matchUp]));
  expect(byCoordinate.get('Backdraw|4|1')?.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  const final = byCoordinate.get('Main|4|1');
  const mainWinner = byCoordinate.get('Main|3|1').sides[byCoordinate.get('Main|3|1').winningSide - 1].participantId;
  const standing = final.sides.filter((side: any) => side.participantId);
  expect(standing.map((side: any) => side.participantId)).toEqual([mainWinner]);
  expect(final.matchUpStatus).toEqual(WALKOVER);
  expect(final.winningSide).toEqual(standing[0].sideNumber);
});
