import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  clearOutcome,
  projectDraw,
  normalize,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A WITHDRAWN BYE SENDS THE RE-DERIVED LOSER ON (census A1 case 28, DO_UNDO_IDENTITY, OLYMPIC 32/29: 9100068).
 *
 * `West|1|2` stands DEFAULTED, awarded to the seat nobody has reached, over Tyrone Bukowski, who carries the default
 * into `South|1|1`, past its BYE, and into `South|2|1`, where it converges with a carried walkover. The probe makes
 * `East|1|3` a double walkover, whose BYE takes `West|1|2`'s empty seat: Bukowski goes on in `West` past it and is
 * taken back out of `South`. Clearing the probe withdraws the BYE and re-derives `West|1|2` to the default it held, and
 * the re-derivation stopped there: the loser it decides was never directed again and had left the draw, and
 * `South|2|1` read a single walkover. Forward play directs them, and so does the settle now
 * (`settleForwardConsequences`, question 2).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const scoreable = (matchUp: any) => (matchUp?.sides ?? []).filter((side: any) => side?.participantId).length === 2;
const find = (matchUps: any[], key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
const occupants = (matchUp: any) =>
  (matchUp?.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined));

const CONFIG = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 29, drawSize: 32, seed: 9100068 };
const POLICY = undefined;
const SCHEDULE: Step[] = [
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];
const PROBE = at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER });

/** the schedule as the census replayed it (a step at a matchUp not ready to be scored is skipped), then the probe and its clear */
function roundTrip(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const step of SCHEDULE) {
    const target = find(getDrawMatchUps(drawId), coordinate(step));
    if (!scoreable(target)) continue;
    const result = observeMutation({ ...mutation(target, step.outcome), drawId });
    expect(result.thrown).toBeUndefined();
  }
  const scheduled = getDrawMatchUps(drawId);
  const before = normalize(projectDraw(getDrawDefinition(drawId)));
  const probe = find(scheduled, coordinate(PROBE));
  const forward = observeMutation({ ...mutation(probe, PROBE.outcome), drawId });
  expect(forward.error).toBeUndefined();
  const cleared = observeMutation({ ...mutation(probe, clearOutcome), drawId });
  expect(cleared.error).toBeUndefined();
  const after = getDrawMatchUps(drawId);
  const restored = normalize(projectDraw(getDrawDefinition(drawId)));
  return { scheduled, after, before, restored };
}
const mutation = (matchUp: any, outcome: any) => ({
  propagateExitStatus: CONFIG.propagateExitStatus,
  matchUpId: matchUp.matchUpId,
  outcome,
});

it('the probe and its clear leave the scheduled draw', () => {
  const { scheduled, after, before, restored } = roundTrip('re-derived-loser');
  expect(restored).toEqual(before);
  const loser = find(scheduled, 'West|1|2').sides.find((side: any) => side.sideNumber === 2).participantId;
  expect(loser).toBeDefined();
  expect(occupants(find(after, 'South|2|1'))).toContain(loser);
  expect(find(after, 'South|2|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
});
