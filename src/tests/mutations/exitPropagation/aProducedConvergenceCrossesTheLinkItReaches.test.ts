import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A PRODUCED CONVERGENCE CROSSES THE LINK IT REACHES (census S8, DRAW_INCONSISTENCY STALLED_POSITION and
 * BYE_ADVANCEMENT_MISSING_ACROSS_LINK in all three arms, DOUBLE_ELIMINATION 16/11, seed 21138954, shrunk from 30 steps
 * to 8).
 *
 * `Main|3|2`'s double walkover leaves the Main final's loser seat, `Backdraw|6|1` dp 1, a BYE. The last step,
 * `Main|2|2`'s double walkover, sends nobody to `Backdraw|2|2`, where `Main|1|5`'s defaulted loser waits, and nobody to
 * `Backdraw|4|2`. The loser is carried through the BYE into `Backdraw|3|1` with their default, opposite the walkover
 * `Backdraw|2|1`'s double walkover produced: a double walkover of two carried exits, which `settleHeldExits` produces
 * onward (`produceStrandedConvergences`). Its exit walks `Backdraw|4|1`'s BYE into `Backdraw|5|1`, whose occupant wins
 * there and goes into the Backdraw final opposite the BYE. Who stands beside a BYE in the Backdraw final crosses the
 * WINNER link into the Main final (`crossLinksThroughByes`), but the settle had asked that before the convergence was
 * produced, and nothing asked it after: the Backdraw champion stood beside the BYE while the Main champion waited in
 * the final for an opponent who could never arrive. Entered before `Main|2|1`'s walkover, `Main|2|2`'s double walkover
 * leaves the same draw.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 21138954,
  drawSize: 16,
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const BEFORE_PRODUCTION = [
  at('Main|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|2|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|2|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|3|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|4', { winningSide: 2 }),
  at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
];
const PRODUCE = at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER });

function drawAfter(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.thrown).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
}

it('the census schedule leaves no stalled seat', () => {
  setSubscriptions({});
  expect(replay(CONFIG, [...BEFORE_PRODUCTION, PRODUCE], 'produced-convergence-crosses-census')).toBeNull();
});

it('the Backdraw champion beside the BYE takes their seat in the Main final', () => {
  const before = drawAfter(BEFORE_PRODUCTION, 'produced-convergence-crosses-before');
  expect(before['Backdraw|3|1'].matchUpStatus).toEqual(WALKOVER);
  expect(before['Backdraw|6|1'].occupants[0]).toEqual(BYE);

  const draw = drawAfter([...BEFORE_PRODUCTION, PRODUCE], 'produced-convergence-crosses-after');
  expect(draw['Backdraw|3|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(draw['Backdraw|5|1'].matchUpStatus).toEqual(WALKOVER);

  const [byeSide, champion] = draw['Backdraw|6|1'].occupants;
  expect(byeSide).toEqual(BYE);
  expect(champion).toBeDefined();

  const mainChampion = draw['Main|4|1'].occupants.find((occupant: any) => occupant && occupant !== BYE);
  expect(draw['Main|5|1'].matchUpStatus).toEqual(TO_BE_PLAYED);
  expect([...draw['Main|5|1'].occupants].sort((a, b) => a.localeCompare(b))).toEqual(
    [champion, mainChampion].sort((a, b) => a.localeCompare(b)),
  );
});

it("entered before `Main|2|1`'s walkover, the same results leave the same draw", () => {
  const last = drawAfter([...BEFORE_PRODUCTION, PRODUCE], 'produced-convergence-crosses-last');
  const earlier = [...BEFORE_PRODUCTION.slice(0, -1), PRODUCE, ...BEFORE_PRODUCTION.slice(-1)];
  expect(drawAfter(earlier, 'produced-convergence-crosses-earlier')).toEqual(last);
});
