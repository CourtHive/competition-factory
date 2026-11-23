import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * A BYE ORIGIN GOES WHEN ITS FEEDER SEAT EMPTIES (census A1 wave 3 G1b: 9 rows across FIRST_ROUND_LOSER_CONSOLATION,
 * FIRST_MATCH_LOSER_CONSOLATION and COMPASS 16, all three arms; this one is FIRST_ROUND_LOSER_CONSOLATION 16/14, seed
 * 21029590).
 *
 * `Consolation|1|1` is a BYE matchUp: one seat holds a BYE, the other waits for `Main|1|2`'s loser. Once that loser
 * arrives the BYE has delivered, so the `DEFAULTED` that `Consolation|1|2`'s double default produces at
 * `Consolation|2|1` stands opposite a true BYE origin (`{ BYE, BYE }` naming `Consolation|1|1`). Clearing `Main|1|2`
 * takes the loser out of the consolation again; their drawPosition stays advanced past the BYE, so no release reached
 * `Consolation|2|1`, and the origin kept naming a BYE that now delivers nobody (ARRIVAL_TRUE: "a BYE origin names
 * Consolation|1|1, which has delivered nothing"). The origin goes with the delivery, and the cleared draw is the draw
 * in which `Main|1|2` was never scored.
 */

const CONFIG = {
  drawType: FIRST_ROUND_LOSER_CONSOLATION,
  propagateExitStatus: false,
  participantsCount: 14,
  seed: 21029590,
  drawSize: 16,
};
const DRAW_ID = 'bye-origin-goes-when-its-feeder-seat-empties';
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (key: string) => getDrawMatchUps(DRAW_ID).find((matchUp: any) => coordinate(matchUp) === key);

function play(steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toBe(true);
  for (const [key, outcome] of steps) {
    const observed = observeMutation({
      propagateExitStatus: false,
      matchUpId: find(key).matchUpId,
      drawId: DRAW_ID,
      outcome,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
}

const SCHEDULE: [string, any][] = [
  ['Main|1|3', { winningSide: 1 }],
  ['Main|1|4', { winningSide: 1 }],
  ['Main|1|2', { winningSide: 2 }],
  ['Consolation|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
];

it('a BYE origin goes when the seat that made its BYE deliver empties', () => {
  // the loser of Main|1|2 is never directed: the BYE has delivered nothing and no origin is recorded
  play(SCHEDULE.filter(([key]) => key !== 'Main|1|2'));
  const neverScored = projectDraw(getDrawDefinition(DRAW_ID));
  expect(find('Consolation|2|1').sideExitProvenance?.[1]).toBeUndefined();

  play(SCHEDULE);
  const feeder = find('Consolation|1|1');
  expect(feeder.matchUpStatus).toEqual(BYE);
  expect(feeder.sides.every((side: any) => side.bye || side.participantId)).toBe(true);
  expect(find('Consolation|2|1').sideExitProvenance?.[1]).toEqual({
    sourceMatchUpId: feeder.matchUpId,
    previousMatchUpStatus: BYE,
    matchUpStatus: BYE,
  });

  const cleared = observeMutation({
    matchUpId: find('Main|1|2').matchUpId,
    propagateExitStatus: false,
    drawId: DRAW_ID,
    outcome: CLEAR,
  });
  expect(cleared.error).toBeUndefined();
  // the feeder's participant seat is empty again, and the origin it gave went with it
  expect(find('Consolation|1|1').sides.some((side: any) => !side.bye && !side.participantId)).toBe(true);
  const final = find('Consolation|2|1');
  expect(final.matchUpStatus).toEqual(DEFAULTED);
  expect(final.sideExitProvenance?.[1]).toBeUndefined();
  expect(projectDraw(getDrawDefinition(DRAW_ID))).toEqual(neverScored);
});
