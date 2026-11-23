import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterAll, beforeAll, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A REMOVAL READS EACH POSITION'S SIDE BEFORE IT TAKES ANY FEEDER (census run 18 ADVANCED_FROM_UNDECIDED,
 * MODIFIED_FEED_IN_CHAMPIONSHIP 32/27 under `allowChangePropagation`, seed 20715466).
 *
 * `Main|1|4`'s double default leaves a BYE at dp 12 in `Consolation|1|2`, and `Main|1|3`'s defaulted loser at dp 11
 * goes past it, and past `2|2`'s BYE, into `Consolation|3|1`, carrying the default. `Consolation|2|1`'s double
 * walkover converges with that carry there: `3|1` is a DOUBLE_WALKOVER, the produced walkover on side 1 and the carry
 * on side 2. Re-scoring `Main|1|4` to a result takes the BYE at dp 12 back, and with it dp 11 out of `2|2` and `3|1`.
 * `3|1` holds dp 11 alone, and a lone position's side is read through the feeder that delivered it, which the removal
 * had already released: the side read nothing, both sides' exits were cleared, and `3|1` fell to TO_BE_PLAYED.
 * `Main|1|4`'s loser then came through to dp 12, opposite `2|1`'s double walkover, was advanced into `4|1` as its
 * walkover's winner, and left `3|1` undecided behind them. Forward play awards them `3|1` by that walkover.
 *
 * The rule: a removal reads the side each position holds before any of its tasks takes anything.
 */

const CONFIG = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 27,
  drawSize: 32,
  seed: 20715466,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('Main|1|13', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|15', { winningSide: 1 }),
  at('Main|2|8', { winningSide: 1 }),
  at('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Consolation|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|4', { winningSide: 2 }),
];
// the same results, `Main|1|4`'s entered once, before the Consolation double walkover
const FORWARD = [...SCHEDULE.slice(1, 6), SCHEDULE[7], SCHEDULE[6]];

// the census arm: every mutation is made with `allowChangePropagation` (`observeMutation`, `replay`)
let priorFlag: string | undefined;
beforeAll(() => {
  priorFlag = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
});
afterAll(() => {
  if (priorFlag === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
  else process.env.ALLOW_CHANGE_PROPAGATION = priorFlag;
});

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const states: Record<string, any>[] = [];
  for (const step of steps) {
    observeMutation({
      propagateExitStatus: CONFIG.propagateExitStatus,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    states.push(snapshot(drawId));
  }
  return states;
}

function snapshot(drawId: string) {
  const matchUps = getDrawMatchUps(drawId);
  const keyOf = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  return Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
        participants: (matchUp.sides ?? []).map((side: any) => side.participantId),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            [entry?.matchUpStatus, keyOf.get(entry?.sourceMatchUpId)],
          ]),
        ),
      },
    ]),
  );
}

const withoutProvenance = (state: Record<string, any>) =>
  Object.fromEntries(Object.entries(state).map(([key, { provenance, ...rest }]) => [key, rest]));

it('no draw inconsistency once the double default is re-scored', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'side-before-removal')).toBeNull();
});

it('the produced walkover stays on its side when the carry leaves, and is awarded to the arrival', () => {
  const states = play('side-before-removal-steps', SCHEDULE);
  expect(states[6]['Consolation|3|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(states[6]['Consolation|3|1'].drawPositions).toEqual([11]);

  const final = states[7]['Consolation|3|1'];
  expect(final.drawPositions).toEqual([12]);
  expect(final.matchUpStatus).toEqual(WALKOVER);
  expect(final.winningSide).toEqual(2);
  expect(final.provenance[1]).toEqual([WALKOVER, 'Consolation|2|1']);
  expect(states[7]['Consolation|4|1'].drawPositions).toEqual([12]);
});

it('every status, award and position matches the same results entered in round order', () => {
  const late = play('side-before-removal-late', SCHEDULE);
  const forward = play('side-before-removal-forward', FORWARD);
  expect(withoutProvenance(late.at(-1) as any)).toEqual(withoutProvenance(forward.at(-1) as any));
});
