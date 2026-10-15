import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A BYE RECORDS NO ARRIVAL BY RESULT (census run 18 ORIGIN_ON_UNDECIDED_MATCHUP, COMPASS 16/16, both default arms, seed
 * 20672521: "side 2 records an arrival by result, on a BYE").
 *
 * Three walkovers carry their losers into West and on into South: `South|1|1`'s two carriers converge, and the walkover
 * the convergence produces in `South|2|1` records, on its other side, the origin of whoever wins `South|1|2` (decided for
 * the seat nobody has reached). `East|1|2`'s double default then puts a BYE in West that sends one carrier home, and
 * `East|1|3`'s double walkover a second, so both of `South|1|1`'s seats become BYEs and `South|2|1` a BYE. A BYE is
 * decided without being played: whoever wins `South|1|2` will advance THROUGH it, and nothing was contested there for
 * that origin to explain, yet it stayed. Entered with either double exit first, `South|2|1` records nothing on that side.
 */

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 20672521 };
const DRAW_ID = 'bye-records-no-arrival-by-result';
const SCHEDULE = [
  { at: 'East|1|8', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { at: 'East|1|4', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { at: 'East|1|1', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { at: 'East|1|2', outcome: { matchUpStatus: DOUBLE_DEFAULT } },
  { at: 'East|1|3', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(order: number[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toBe(true);
  for (const { at, outcome } of order.map((index) => SCHEDULE[index])) {
    const target = getDrawMatchUps(DRAW_ID).find((matchUp: any) => coordinate(matchUp) === at);
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId: DRAW_ID,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  const matchUps = getDrawMatchUps(DRAW_ID);
  return {
    issueTypes: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
      (issue: any) => issue.issueType,
    ),
    southTwoOne: matchUps.find((matchUp: any) => coordinate(matchUp) === 'South|2|1'),
    draw: Object.fromEntries(
      matchUps.map((matchUp: any) => [
        coordinate(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          drawPositions: matchUp.drawPositions,
          participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
        },
      ]),
    ),
  };
}

it('the origin recorded beside an exit goes when the matchUp becomes a BYE', () => {
  const late = play([0, 1, 2, 3, 4]);
  expect(late.issueTypes).toEqual([]);
  expect(late.southTwoOne.matchUpStatus).toEqual(BYE);
  expect(late.southTwoOne.sideExitProvenance ?? {}).toEqual({});

  const forward = play([3, 4, 0, 1, 2]);
  expect(forward.issueTypes).toEqual([]);
  expect(forward.southTwoOne.sideExitProvenance ?? {}).toEqual({});
  expect(late.draw).toEqual(forward.draw);
});
