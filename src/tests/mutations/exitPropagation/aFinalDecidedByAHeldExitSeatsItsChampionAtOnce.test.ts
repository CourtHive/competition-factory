import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A FINAL DECIDED BY A HELD EXIT SEATS ITS CHAMPION AT ONCE (census int2, IDEMPOTENT_REAPPLY, DOUBLE_ELIMINATION 8/5
 * seed 21037067, under each of the three census arms).
 *
 * `Main|1|2` and `Main|2|2` are walkovers, so the Backdraw holds a produced walkover from `Backdraw|2|2`'s double
 * walkover. A double walkover at `Main|2|1` sends the Main champion through `Main|3|1` into the final, `Main|4|1`, and
 * leaves the Backdraw with nobody: its held exit is sent on by the settle (`settleHeldExits`) into the final, which the
 * Main champion wins over it. The decider's seats are filled over the links, and the winner's crossing was asked only
 * before the settle (`reconcileMissedLinkAdvancements`): the final was not decided yet, so the champion was seated in
 * the decider only when the same double walkover was entered a second time. A second entry of an outcome writes
 * nothing; the crossing is now asked again once the held exits have been sent on, before the decider is settled.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 5,
  drawSize: 8,
  seed: 21037067,
};
const SCHEDULE = [
  at('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
];
const PROBE = at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });

const ARMS = [
  { arm: 'default', policyDefinitions: undefined, allowChangePropagation: false },
  {
    arm: 'doubleExitPropagateBye: false',
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
    allowChangePropagation: false,
  },
  { arm: 'allowChangePropagation', policyDefinitions: undefined, allowChangePropagation: true },
];

it.each(ARMS)('$arm', ({ policyDefinitions, allowChangePropagation }) => {
  if (allowChangePropagation) process.env.ALLOW_CHANGE_PROPAGATION = '1';
  else delete process.env.ALLOW_CHANGE_PROPAGATION;
  try {
    setSubscriptions({});
    const drawId = 'held-exit-final';
    expect(prepareDraw(CONFIG, drawId, policyDefinitions)).toEqual(true);
    const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const apply = (step: Step) =>
      observeMutation({
        propagateExitStatus: true,
        matchUpId: find(coordinate(step)).matchUpId,
        outcome: step.outcome,
        drawId,
      });

    for (const step of SCHEDULE) expect(apply(step).error).toBeUndefined();

    const first = apply(PROBE);
    expect(first.error).toBeUndefined();
    expect(first.mutated).toEqual(true);

    // CONTROL: the arrangement under test. The final was won by the Main champion over the Backdraw's exit.
    const final = find('Main|4|1');
    const champion = final.sides.find((side: any) => side.sideNumber === final.winningSide)?.participantId;
    expect(final.matchUpStatus).toEqual(WALKOVER);
    expect(champion).toBeDefined();
    expect(final.sides.find((side: any) => side.sideNumber !== final.winningSide)?.participantId).toBeUndefined();

    // 1. THE CHAMPION IS IN THE DECIDER after the first entry
    const decider = find('Decider|1|1');
    expect(decider.sides.map((side: any) => side.participantId)).toContain(champion);

    // 2. AND A SECOND ENTRY OF THE SAME OUTCOME WRITES NOTHING
    const second = apply(PROBE);
    expect(second.error).toBeUndefined();
    expect(second.mutated).toEqual(false);
  } finally {
    delete process.env.ALLOW_CHANGE_PROPAGATION;
  }
});
