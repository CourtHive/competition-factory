import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER PASSING A BYE ONTO THE SIDE A DISSOLVED DOUBLE EXIT DECIDED BRINGS ITS OWN EXIT (census run 17 F3
 * MONOTONIC_DECISION, OLYMPIC 16/16 seed 20738091, `doubleExitPropagateBye: false`).
 *
 * `South|1|1` holds two defaulted participants and is a DOUBLE_DEFAULT, whose produced exit decides `South|2|1` for the
 * participant opposite. `East|1|4`'s double walkover then converges `West|1|2` and gives `South|1|1` a BYE in place of
 * that matchUp's loser. The double default dissolves; the defaulted participant left beside the BYE passes through it
 * onto the side of `South|2|1` the double default had decided. That side kept only the double default's entry, which
 * settle voids as stale, and `South|2|1` re-opened beneath a defaulted participant. The carrier's own DEFAULTED is
 * that side's record, as it is when the double walkover comes first.
 *
 * Replayed through the census's own `replay`: every per-step property, then the forward monotonic check. The draw
 * itself is then read with the double walkover entered last and first, without the census probe.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const config = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 20738091 };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const setup = [
  at('East|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|5', { winningSide: 2 }),
  at('East|1|1', { winningSide: 1 }),
  at('East|1|6', { winningSide: 1 }),
  at('East|1|8', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('West|1|3', { winningSide: 2 }),
  at('East|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];

it('scoring the matchUp that dissolves the double exit un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(config, setup, 'carrier-dissolved-exit', POLICY_OFF)).toBeNull();
});

it('the carrier records its own exit on the side the double exit decided, in either order', () => {
  for (const [label, steps] of [
    ['double walkover last', [...setup, at('East|1|4', { matchUpStatus: DOUBLE_WALKOVER })]],
    ['double walkover first', [...setup.slice(0, 6), at('East|1|4', { matchUpStatus: DOUBLE_WALKOVER }), setup[6]]],
  ] as const) {
    setSubscriptions({});
    const drawId = `carrier-dissolved-exit-${label.split(' ').join('-')}`;
    prepareDraw(config, drawId, POLICY_OFF);
    for (const step of steps) {
      const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
      const params = { propagateExitStatus: true, matchUpId: target.matchUpId, outcome: step.outcome, drawId };
      expect(observeMutation(params).error, label).toBeUndefined();
    }
    const matchUps = getDrawMatchUps(drawId);
    const find = (key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
    expect(find('South|1|1').matchUpStatus, label).toEqual(BYE);
    const onward = find('South|2|1');
    expect(onward.matchUpStatus, label).toEqual(DEFAULTED);
    expect(onward.winningSide, label).toEqual(2);
    const carrier = onward.sideExitProvenance?.[1];
    expect(carrier?.matchUpStatus, label).toEqual(DEFAULTED);
    expect(coordinate(matchUps.find((matchUp: any) => matchUp.matchUpId === carrier?.sourceMatchUpId)), label).toEqual(
      'West|1|1',
    );
  }
});
