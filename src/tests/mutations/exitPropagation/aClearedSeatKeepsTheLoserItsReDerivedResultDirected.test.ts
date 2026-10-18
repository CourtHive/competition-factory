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
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CLEARED SEAT KEEPS THE LOSER ITS RE-DERIVED RESULT DIRECTED (census A1 case 6, DO_UNDO_IDENTITY, COMPASS 32/30:
 * 20485116).
 *
 * `West|2|1` stands WALKOVER, awarded to the seat nobody has reached, over Robinson Shaftoe, who carries the walkover
 * into `Southwest|1|1` and past its BYE into `Southwest|2|1`. The probe makes `East|1|3` a double walkover, whose BYE
 * takes `West|1|2`'s seat 3 and advances the empty seat 4 opposite it into `West|2|1`'s open seat. Clearing it takes
 * that position back out, `West|2|1` re-derives to the walkover it held over the same loser, and the removal then took
 * the loser back out of the loser structure, though nothing about them had changed. The loser link is served from the
 * re-derived matchUp now (`positionClear`, `reDerivedLoserStands`): a loser already standing where it leads is left
 * there.
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

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20485116 };
const POLICY = undefined;
const SCHEDULE: Step[] = [
  at('East|1|15', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|15', { winningSide: 1 }),
  at('East|1|9', { winningSide: 2 }),
  at('East|1|2', { winningSide: 1 }),
  at('East|2|1', { winningSide: 1 }),
  at('East|1|8', { winningSide: 1 }),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|8', { winningSide: 2 }),
  at('East|1|8', { winningSide: 1 }),
  at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|13', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|5', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
  at('East|1|7', { winningSide: 1 }),
  at('East|2|8', { winningSide: 1 }),
  at('East|1|14', { winningSide: 1 }),
  at('West|1|4', { winningSide: 1 }),
  at('West|1|4', { winningSide: 2 }),
  at('West|2|4', { winningSide: 1 }),
  at('East|1|10', { winningSide: 2 }),
  at('East|1|9', { winningSide: 2 }),
  at('East|1|2', { winningSide: 2 }),
  at('West|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('West|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('West|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|2|3', { winningSide: 1 }),
  at('East|1|9', { winningSide: 2 }),
  at('East|1|13', { winningSide: 2 }),
  at('East|1|11', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
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
  const { before, restored } = roundTrip('re-derived-loser-stays');
  expect(restored).toEqual(before);
});

it('the carrier stays in the loser structure, and keeps the walkover it carried', () => {
  const { scheduled, after } = roundTrip('re-derived-loser-carrier');
  const carrier = find(scheduled, 'West|2|1').sides.find((side: any) => side.sideNumber === 1).participantId;
  expect(carrier).toBeDefined();
  expect(occupants(find(after, 'Southwest|1|1'))).toEqual([carrier, 'BYE']);
  expect(find(after, 'Southwest|2|1').matchUpStatus).toEqual(WALKOVER);
  expect(occupants(find(after, 'Southwest|2|1'))).toContain(carrier);
});
