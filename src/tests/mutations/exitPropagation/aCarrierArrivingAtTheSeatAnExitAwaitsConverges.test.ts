import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER ARRIVING AT THE SEAT AN EXIT AWAITS CONVERGES WITH IT (census A1 wave 3 G5, COMPASS 32/27 seed 21028022,
 * the census schedule shrunk to three results and the probe).
 *
 * `East|1|4`'s walkover sends its loser into `West|1|2`, and their walkover is carried past two BYEs into `South|3|1`,
 * where it is awarded to the seat opposite (side 2), nobody there yet. `East|1|14`'s walkover sends a second carrier
 * into `West|1|7`; `East|1|10`'s double default then puts a BYE beside them in `South|2|2`, and they pass it into that
 * awaited seat carrying their own walkover. Two exits meeting converge (RULE 4): `South|3|1` is a DOUBLE_WALKOVER, as it
 * is when the second carrier's exit is recorded first. Before this the arrival took the award: their carry was not
 * recorded, and they won `South|3|1` on the walkover they had brought with them. The census saw it as the round trip
 * of `East|1|3`'s double walkover, whose BYE dissolved the matchUp and whose clear re-derived the convergence.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
// the round trip's projection without `matchUpStatusCodes` (index 4), whose writers disagree by design (census F1)
const roundTrip = (drawId: string) =>
  projectDraw(getDrawDefinition(drawId)).map((structure: any) => ({
    ...structure,
    matchUps: structure.matchUps.map((row: any[]) => row.filter((_: any, index: number) => index !== 4)),
  }));

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 21028022 };
const WALKOVER_1 = { matchUpStatus: WALKOVER, winningSide: 1 };
const SCHEDULE = [
  at('East|1|4', WALKOVER_1),
  at('East|1|14', WALKOVER_1),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
];
const PROBE = at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER });

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  const enter = (step: Step) => {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
  };
  steps.forEach(enter);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  // provenance with each source named by its coordinate, so two draws can be compared
  const named = (key: string) => {
    const keys = new Map(getDrawMatchUps(drawId).map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
    const entries = Object.entries(find(key).sideExitProvenance ?? {});
    return Object.fromEntries(
      entries.map(([side, entry]: any) => [side, { ...entry, sourceMatchUpId: keys.get(entry.sourceMatchUpId) }]),
    );
  };
  return { enter, find, named };
}

it('the carrier who reaches the awarded seat brings an exit, and the two converge', () => {
  const { find } = play(SCHEDULE, 'awaited-seat-converges');
  const final = find('South|3|1');
  expect(final.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(final.winningSide).toBeUndefined();
  expect(final.sides.every((side: any) => side.participantId)).toEqual(true);
  const sources = Object.values(final.sideExitProvenance ?? {}).map((entry: any) => entry.sourceMatchUpId);
  expect(sources.toSorted()).toEqual([find('West|1|2').matchUpId, find('West|1|7').matchUpId].toSorted());
});

it('the same results entered last to first reach the same matchUp', () => {
  const forward = play(SCHEDULE, 'awaited-seat-forward');
  const forwardStatus = forward.find('South|3|1').matchUpStatus;
  const forwardProvenance = forward.named('South|3|1');
  const reverse = play(SCHEDULE.toReversed(), 'awaited-seat-reverse');
  expect(reverse.find('South|3|1').matchUpStatus).toEqual(forwardStatus);
  expect(reverse.named('South|3|1')).toEqual(forwardProvenance);
});

it('a double walkover beside it and its clear return the draw as it was', () => {
  const drawId = 'awaited-seat-round-trip';
  const { enter } = play(SCHEDULE, drawId);
  const before = roundTrip(drawId);
  enter(PROBE);
  enter({ ...PROBE, outcome: CLEAR });
  expect(roundTrip(drawId)).toEqual(before);
});
