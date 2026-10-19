import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A RE-DERIVED CONVERGENCE KEEPS THE BYE CLAIMS OF OTHERS (census run 19 MONOTONIC_DECISION, COMPASS 16/13 under
 * `doubleExitPropagateBye: false`, seed 20849541).
 *
 * `Southwest|1|1` holds two carried exits, converged. `East|1|2`'s double walkover then makes `West|2|1` a walkover won
 * over its produced exit: its loser is nobody, so the seat that loser would take, `Southwest` dp 1, becomes a BYE and
 * `West|2|1` records the claim there. The same call dissolves the convergence in `Southwest|1|1`, and its
 * re-derivation rewrote the provenance from the kept carrier alone, dropping the claim with everything else. A claim
 * leaves when its claimant withdraws it (`positionClear`), and with it gone nothing could: re-entering `East|1|2` as a
 * played result gave `West|2|1` a real loser again, the BYE stood, and that loser later arrived onto it.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 13, drawSize: 16, seed: 20849541 };
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const SCHEDULE = [
  at('East|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|4', { winningSide: 2 }),
  at('East|1|5', { winningSide: 2 }),
  at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|2|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|4', { winningSide: 2 }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|7', { winningSide: 1 }),
  at('East|3|2', { winningSide: 1 }),
  at('East|1|2', RETIRED_6_3),
  at('East|2|2', { winningSide: 2 }),
];
// the census probes, in the order it applied them; the last reported the un-decided matchUp
const PROBES = [at('East|2|1', { matchUpStatus: DOUBLE_WALKOVER }), at('West|2|1', { winningSide: 1 })];
const UP_TO_THE_DOUBLE_WALKOVER = SCHEDULE.slice(0, 6);

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
  expect(replay(CONFIG, SCHEDULE, 'rederived-claims', POLICY_OFF)).toBeNull();
});

it("the convergence's re-derivation keeps the claim West|2|1 made on the seat beside it", () => {
  const { find } = play(UP_TO_THE_DOUBLE_WALKOVER, 'rederived-claims-dwo');
  const southwest = find('Southwest|1|1');
  expect(southwest.matchUpStatus).toEqual(BYE);
  const claimant = find('West|2|1').matchUpId;
  const claims = Object.values(southwest.sideExitProvenance ?? {}).flatMap((entry: any) => entry?.byeClaims ?? []);
  expect(claims).toContain(claimant);
});

it('the BYE goes when the correction gives West|2|1 a loser again', () => {
  const { find } = play(SCHEDULE, 'rederived-claims-corrected');
  expect(find('Southwest|1|1').sides.some((side: any) => side?.bye)).toEqual(false);
});

it('the whole draw is the one the same results entered directly reach', () => {
  const census = play([...SCHEDULE, ...PROBES], 'rederived-claims-census');
  expect(play(forwardOrder(census.accepted), 'rederived-claims-forward').draw).toEqual(census.draw);
});
