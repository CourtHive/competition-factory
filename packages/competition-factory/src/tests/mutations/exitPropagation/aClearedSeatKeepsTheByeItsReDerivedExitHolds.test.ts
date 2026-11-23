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
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import {
  BYE,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A CLEARED SEAT KEEPS THE BYE ITS RE-DERIVED EXIT HOLDS (census A1 case 13, DO_UNDO_IDENTITY, COMPASS 32/30 under
 * `doubleExitPropagateBye: false`: 20694910).
 *
 * `South|1|3` stands WALKOVER, awarded to the seat nobody has reached, over a produced exit: its loser is nobody, and
 * its loser seat in `Southeast|1|2` is the BYE nobody can fill. The probe makes `East|1|10` a double walkover, whose BYE
 * takes `South|1|3`'s other seat. Clearing it re-derives `South|1|3` to the award, and the removal then took back what
 * `South|1|3` had sent over its loser link without asking what the re-derived matchUp sends: the BYE went, and
 * `Southeast|1|2` was left owing a seat to an opponent who can never arrive. The loser link is served from the
 * re-derived matchUp now (`positionClear`, `reDerivedLoserStands`); the award goes on again as well (question 1 of
 * `settleForwardConsequences`).
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

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20694910 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const SCHEDULE: Step[] = [
  at('East|1|10', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|6', { winningSide: 1 }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|9', { winningSide: 2 }),
  at('East|1|8', { winningSide: 2 }),
  at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|12', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', { winningSide: 1 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|4', { winningSide: 1 }),
  at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|6', { winningSide: 1 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|8', { winningSide: 2 }),
  at('East|1|3', { winningSide: 1 }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|15', { winningSide: 2 }),
  at('East|2|6', { winningSide: 2 }),
  at('East|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|8', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('East|2|8', { winningSide: 2 }),
];
const PROBE = at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER });

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
  const { before, restored } = roundTrip('re-derived-exit-bye');
  expect(restored).toEqual(before);
});

it("the BYE at South|1|3's loser seat stands", () => {
  const { after } = roundTrip('re-derived-exit-bye-seat');
  expect(find(after, 'South|1|3').matchUpStatus).toEqual(WALKOVER);
  expect(occupants(find(after, 'Southeast|1|2'))).toEqual(['BYE', 'BYE']);
  expect(find(after, 'Southeast|1|2').matchUpStatus).toEqual(BYE);
});
