import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DEFAULTED, DOUBLE_DEFAULT, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A BYE ORIGIN WAITS FOR ITS FEEDER TO DELIVER (census A1 case 26, FIRST_MATCH_LOSER_CONSOLATION 8/7, policy off, seed
 * 20498521: `Consolation|3|1` side 2 recorded `{ BYE }` in 8 of 12 entry orders and nothing in the other 4).
 *
 * `Main|2|2`'s loser already played in round 1, so the consolation feed seat it would take, drawPosition 2, gets a BYE,
 * and `Consolation|2|2` reads `BYE` while its other seat still waits for whoever wins `Consolation|1|2`. A
 * `DOUBLE_DEFAULT` at `Consolation|2|1` produces a DEFAULTED on side 1 of the final. The pair stamp read the paired
 * feeder's `BYE` status and recorded a BYE origin on side 2, but that BYE has delivered nothing: the winner of
 * `Consolation|1|2` will advance through it. Entered with the double default before `Main|2|2`, the BYE did not exist
 * yet and nothing was recorded. "A side that has not been decided has no origin": the final's side 2 records nothing
 * until the BYE feeder delivers, in either order.
 */

const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: false,
  participantsCount: 7,
  seed: 20498521,
  drawSize: 8,
};
const DRAW_ID = 'bye-origin-waits-for-its-feeder-to-deliver';
const SCHEDULE = [
  { at: 'Main|1|3', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { at: 'Main|1|2', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { at: 'Main|2|1', outcome: { winningSide: 2 } },
  { at: 'Consolation|2|1', outcome: { matchUpStatus: DOUBLE_DEFAULT } },
  {
    at: 'Main|1|4',
    outcome: { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
  },
  { at: 'Main|2|2', outcome: { winningSide: 1 } },
  { at: 'Main|3|1', outcome: { winningSide: 1 } },
];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(order: number[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toBe(true);
  for (const { at, outcome } of order.map((index) => SCHEDULE[index])) {
    const target = getDrawMatchUps(DRAW_ID).find((matchUp: any) => coordinate(matchUp) === at);
    const observed = observeMutation({
      propagateExitStatus: false,
      matchUpId: target.matchUpId,
      outcome,
      drawId: DRAW_ID,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  const matchUps = getDrawMatchUps(DRAW_ID);
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  const at = (c: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === c);
  const provenance = (c: string) =>
    Object.fromEntries(
      Object.entries(at(c)?.sideExitProvenance ?? {}).map(([side, entry]: [string, any]) => [
        side,
        { ...entry, sourceMatchUpId: byId.get(entry.sourceMatchUpId) },
      ]),
    );
  return {
    issueTypes: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
      (issue: any) => issue.issueType,
    ),
    byeFeeder: at('Consolation|2|2'),
    final: provenance('Consolation|3|1'),
  };
}

it('a BYE still awaiting its other seat records no origin on the side it feeds', () => {
  const byeFirst = play([0, 1, 2, 4, 5, 3, 6]);
  expect(byeFirst.issueTypes).toEqual([]);
  // the BYE stands beside a seat nobody has reached yet
  expect(byeFirst.byeFeeder.matchUpStatus).toEqual(BYE);
  expect(byeFirst.byeFeeder.sides.some((side: any) => !side.participantId && !side.bye)).toBe(true);
  expect(byeFirst.final).toEqual({
    1: { matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_DEFAULT, sourceMatchUpId: 'Consolation|2|1' },
  });

  const exitFirst = play([0, 1, 2, 3, 4, 5, 6]);
  expect(exitFirst.issueTypes).toEqual([]);
  expect(exitFirst.final).toEqual(byeFirst.final);
});
