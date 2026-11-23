import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A REMOVAL WALKS ONLY THROUGH A REAL PARTNER (census run 19 MONOTONIC_DECISION, FIRST_MATCH_LOSER_CONSOLATION 16/15 under
 * `doubleExitPropagateBye: false`, seed 20806518).
 *
 * `Consolation|2|1`'s double walkover produces a walkover into `Consolation|3|1`, where it waits. `Main|1|7` is then
 * relabelled from a played win to a DEFAULTED for the same winner; an unscored default is no prior win, so the
 * FIRST_MATCHUP reservation for `Main|2|4`'s loser, the BYE at `Consolation` dp 4, is rightly withdrawn. dp 4 stands
 * alone in `Consolation|2|4`, and the removal asked the next round for the pair holding its partner: the hole. A hole is
 * not a drawPosition (`draw-positions.md` § 5), but `includes(undefined)` found round 3's `[undefined, 8]`, and the
 * removal reset `Consolation|3|1`, which dp 4 never reached, dropping the walkover standing there. The probe's arrival
 * then met nobody's exit. Entered directly, the arrival wins that walkover.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 15,
  drawSize: 16,
  seed: 20806518,
};
const SCHEDULE = [
  at('Main|1|7', { winningSide: 1 }),
  at('Main|1|2', { winningSide: 1 }),
  at('Main|2|1', { winningSide: 2 }),
  at('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Consolation|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|8', { winningSide: 2 }),
  at('Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|3', { winningSide: 2 }),
];
// the census probe that reported the un-decided matchUp
const PROBE = at('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });

/** each matchUp's last accepted outcome, entered once, structure by structure and round by round */
function forwardOrder(steps: Step[]): Step[] {
  const net = new Map<string, Step>();
  for (const step of steps) {
    net.delete(coordinate(step));
    net.set(coordinate(step), step);
  }
  const structures = [...new Set(steps.map((step) => step.structureName))];
  return [...net.values()].toSorted(
    (a, b) =>
      structures.indexOf(a.structureName) - structures.indexOf(b.structureName) ||
      a.roundNumber - b.roundNumber ||
      a.roundPosition - b.roundPosition,
  );
}

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const accepted: Step[] = [];
  let pending = steps;
  while (pending.length) {
    const left: Step[] = [];
    for (const step of pending) {
      const target = find(coordinate(step));
      // the census's own rule: a matchUp is scored only once both of its participants are there
      if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) {
        left.push(step);
        continue;
      }
      const observed = observeMutation({
        propagateExitStatus: true,
        matchUpId: target.matchUpId,
        outcome: step.outcome,
        drawId,
      });
      expect(observed.thrown).toBeUndefined();
      if (!observed.error) accepted.push(step);
    }
    if (left.length === pending.length) break;
    pending = left;
  }
  const draw = Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
  return { find, accepted, draw };
}

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'removal-real-partner', POLICY_OFF)).toBeNull();
});

it("the withdrawn reservation leaves the walkover waiting a round on, and the probe's arrival wins it", () => {
  const { find } = play(SCHEDULE, 'removal-real-partner-schedule');
  const waiting = find('Consolation|3|1');
  expect(waiting.matchUpStatus).toEqual(WALKOVER);
  expect(Object.values(waiting.sideExitProvenance ?? {}).some((entry: any) => entry?.sourceMatchUpId)).toEqual(true);

  const probed = play([...SCHEDULE, PROBE], 'removal-real-partner-probed').find('Consolation|3|1');
  expect(probed.matchUpStatus).toEqual(WALKOVER);
  expect(probed.winningSide).toBeDefined();
});

it('the whole draw is the one the same results entered directly reach', () => {
  const census = play([...SCHEDULE, PROBE], 'removal-real-partner-census');
  expect(play(forwardOrder(census.accepted), 'removal-real-partner-forward').draw).toEqual(census.draw);
});
