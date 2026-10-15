import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CARRY'S OWN EXIT RELABELS THE MATCHUP IT REPLACES (census run 18, COMPASS 32/30, seed 20715025, the four results of
 * `aParticipantPastAHoldersByeTakesItsPlace` in all 24 orders).
 *
 * `South|1|3`'s convergence of a walkover and a default produces a walkover into `South|2|2`, and once `South|1|4` is a
 * BYE that walkover is sent on, pending, into `South|3|1`. `East|1|9`'s double walkover then dissolves the convergence:
 * the defaulted carrier comes through the BYEs and their own default replaces the produced exit's entry in `South|3|1`.
 * The entry was replaced and the label was not: `South|3|1` read WALKOVER beside a DEFAULTED record in the six orders
 * with `East|1|9` last, and DEFAULTED in the other eighteen. The label is the record's.
 */

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20715025 };
const DRAW_ID = 'carrys-own-exit-relabels';
const SCHEDULE = [
  { at: 'East|1|10', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { at: 'East|1|12', outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  { at: 'East|1|9', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
  { at: 'East|1|13', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item) => permutations(items.filter((other) => other !== item)).map((rest) => [item, ...rest]));
}

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
  const issueTypes = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (issue: any) => issue.issueType,
  );
  const draw = Object.fromEntries(
    getDrawMatchUps(DRAW_ID).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
  return { issueTypes, draw };
}

it("every order of the four results leaves one draw, South|3|1 the carrier's default", () => {
  const reference = play([3, 2, 1, 0]);
  expect(reference.draw['South|3|1'].matchUpStatus).toEqual(DEFAULTED);
  for (const order of permutations([0, 1, 2, 3])) {
    const { issueTypes, draw } = play(order);
    expect(issueTypes, order.join('')).toEqual([]);
    expect(draw, order.join('')).toEqual(reference.draw);
  }
}, 120_000);
