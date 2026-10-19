import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * AN UNWIND TAKES BACK WHAT ITS PARTICIPANT WAS SENT ON THROUGH A RESULT IT LEAVES STANDING (census S8 policy-off,
 * ERROR_IMPLIES_NO_MUTATION ERR_OCCUPIED_DRAW_POSITION, DOUBLE_ELIMINATION 8/6: 20590443).
 *
 * `Main|1|3`'s double walkover lets the participant past `Main|1|4`'s BYE win `Main|2|2` by walkover, then `Main|3|1`
 * on `Main|2|1`'s produced walkover, then the Main final, and so into the Decider. Re-scoring `Main|1|3` as a played
 * win unwinds that. `Main|3|1`'s walkover is `Main|2|1`'s and stands, so the walk stopped there ("an unwind does not walk
 * on through a result it leaves standing", #5455) — but the participant it had sent on was the unwind's, and stayed in
 * the Decider. The next Main final result was refused after a write. The exit stands; the advance through it does not.
 * Passed before b21f2fafd1.
 *
 * The same holds across a link, where the next winner matchUp numbers its positions in its own structure and the
 * participant is followed instead (census S8 `allowChangePropagation`, DOUBLE_ELIMINATION 8/6: 20701264). Passed
 * before b21f2fafd1.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const config = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 6,
  drawSize: 8,
  seed: 20590443,
};
const schedule = [
  at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|3', { winningSide: 2 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Backdraw|2|1', { winningSide: 2 }),
  at('Main|4|1', { winningSide: 1 }),
];

function drawAfter(steps: Step[], drawId: string, scenario: any = config, policyDefinitions: any = POLICY_OFF) {
  setSubscriptions({});
  prepareDraw(scenario, drawId, policyDefinitions);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const result: any = observeMutation({
      propagateExitStatus: scenario.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
}

it('20590443: the corrected schedule leaves a consistent draw', () => {
  setSubscriptions({});
  expect(replay(config, schedule, 'sent-on-through-standing', POLICY_OFF)).toBeNull();
});

it('20590443: the correction reaches the draw the played win entered directly reaches', () => {
  const viaCorrection = drawAfter(schedule.slice(0, 4), 'sent-on-through-standing-corrected');
  const direct = drawAfter([schedule[0], schedule[1], schedule[3]], 'sent-on-through-standing-direct');
  expect(viaCorrection).toEqual(direct);
  // the participant the double walkover had sent through the Main final is not left in the Decider
  expect(viaCorrection['Decider|1|1'].occupants.filter(Boolean)).toEqual([]);
  // and the walkover the unwind leaves standing is still there, pending
  expect(viaCorrection['Main|3|1'].matchUpStatus).toEqual(WALKOVER);
});

describe('across a link (allowChangePropagation)', () => {
  const linkConfig = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 6,
    drawSize: 8,
    seed: 20701264,
  };
  const RETIREMENT = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
  const CORRECTED = 4;
  const CORRECTION = 6;
  const linkSchedule = [
    at('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|2', { winningSide: 1 }),
    at('Main|2|2', { winningSide: 2 }),
    at('Main|1|3', { winningSide: 1 }),
    at('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
    at('Backdraw|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|2|1', RETIREMENT),
    at('Main|1|3', { winningSide: 1 }),
    at('Backdraw|2|1', { winningSide: 2 }),
    at('Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|4|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
  ];

  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.ALLOW_CHANGE_PROPAGATION;
    process.env.ALLOW_CHANGE_PROPAGATION = '1';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
    else process.env.ALLOW_CHANGE_PROPAGATION = previous;
  });

  it('20701264: the corrected schedule leaves a consistent draw', () => {
    setSubscriptions({});
    expect(replay(linkConfig, linkSchedule, 'sent-on-across-link')).toBeNull();
  });

  it('20701264: the correction reaches the draw the played result entered directly reaches', () => {
    const viaCorrection = drawAfter(
      linkSchedule.slice(0, CORRECTION + 1),
      'sent-on-across-link-corrected',
      linkConfig,
      undefined,
    );
    const direct = drawAfter(
      [...linkSchedule.slice(0, CORRECTED), linkSchedule[CORRECTION], linkSchedule[CORRECTED + 1]],
      'sent-on-across-link-direct',
      linkConfig,
      undefined,
    );
    expect(viaCorrection).toEqual(direct);
    // the participant the double default had sent through the Main final is not left in the Decider
    expect(viaCorrection['Decider|1|1'].occupants.filter(Boolean)).toEqual([]);
  });
});
