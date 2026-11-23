import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER WHOSE DOUBLE EXIT DISSOLVES KEEPS THEIR OWN EXIT, AND MEETS THE EXIT PRODUCED OPPOSITE (census run 17 F3
 * MONOTONIC_DECISION, OLYMPIC 16/16 seed 20738091, `doubleExitPropagateBye: false`).
 *
 * `South|1|1` holds two defaulted participants and is a DOUBLE_DEFAULT, whose produced exit decides `South|2|1` for the
 * participant opposite. `East|1|4`'s double walkover then converges `West|1|2`, and `South|1|1` loses that matchUp's
 * loser. Under the policy off a double exit's loser seat shows the exit it produced, never a BYE (CA ruling (A),
 * 2026-10-21), so the double default dissolves into a new convergence: the defaulted participant from `West|1|1` stays,
 * opposite `West|1|2`'s produced walkover, and `South|1|1` is a DOUBLE_WALKOVER (a mixture takes the weaker label).
 * Its produced walkover decides `South|2|1` for the participant opposite, as the double default did. Before the ruling
 * the seat took a BYE, the carrier passed it onto the side the double default had decided, and the census found
 * `South|2|1` re-opened beneath them when settle voided that side's stale entry.
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

it('the carrier keeps its own exit and converges with the exit produced opposite, in either order', () => {
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
    const converged = find('South|1|1');
    expect(converged.matchUpStatus, label).toEqual(DOUBLE_WALKOVER);
    // the carrier keeps their own DEFAULTED from `West|1|1`, opposite the walkover `West|1|2`'s convergence produced
    const named = (entry: any) =>
      coordinate(matchUps.find((matchUp: any) => matchUp.matchUpId === entry?.sourceMatchUpId));
    expect(converged.sideExitProvenance?.[1]?.matchUpStatus, label).toEqual(DEFAULTED);
    expect(named(converged.sideExitProvenance?.[1]), label).toEqual('West|1|1');
    expect(converged.sideExitProvenance?.[2]?.matchUpStatus, label).toEqual(WALKOVER);
    expect(named(converged.sideExitProvenance?.[2]), label).toEqual('West|1|2');
    // ...and `South|2|1` is decided by the walkover `South|1|1` produces, for the side the double default decided
    const onward = find('South|2|1');
    expect(onward.matchUpStatus, label).toEqual(WALKOVER);
    expect(onward.winningSide, label).toEqual(2);
    expect(onward.sideExitProvenance?.[1]?.matchUpStatus, label).toEqual(WALKOVER);
    expect(named(onward.sideExitProvenance?.[1]), label).toEqual('South|1|1');
  }
});
