import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A PARTICIPANT PASSING A HOLDER'S BYE TAKES ITS PLACE ONE ROUND ON, AND A DISSOLVED PRODUCED EXIT'S RESERVATION GOES
 * WITH IT (census run 18 TWO_POSITIONS_FROM_ONE_FEEDER, COMPASS 32/30, both default arms, seed 20715025; the same two
 * roots closed 20643740, COMPASS 32/30 under `doubleExitPropagateBye: false`).
 *
 * `East|1|10`'s walkover and `East|1|12`'s default carry their losers through West into `South|1|3`, where they
 * converge; the convergence produces a walkover, pending, into `South|2|2`, whose seat dp 7 (held open by
 * `South|1|4`'s BYE for a loser still to come) is advanced into `South|3|1` as the reservation the exit awaits.
 * `East|1|9`'s double walkover then sends the walkover's carrier home past a BYE, the convergence dissolves, and the
 * defaulted carrier comes through `South|1|3`'s BYE into `South|2|2` carrying their default, which replaces the produced
 * exit there. Two orders then left `South|3|1` holding both of `South|2|2`'s positions:
 *
 * - `East|1|9` before `East|1|13`: the produced exit was replaced, not withdrawn, so its reservation stayed in
 *   `South|3|1`; when `East|1|13`'s double walkover made dp 7 a BYE, the carrier went on past it and met dp 7 there.
 * - `East|1|13` before `East|1|9`: dp 7 was a BYE already and `South|2|2` held the produced exit beside it, its BYE
 *   position advanced one round on (the BYE stays; the exit travels). The carrier arriving opposite that BYE went on
 *   past it into `South|3|1`, and the BYE position was still there.
 *
 * Entered with the double walkovers first, `South|3|1` holds the carrier alone, their default awarded to the seat
 * still to be reached. A carry replacing a dissolved produced exit releases its reservation, and a participant passing
 * a holder's BYE takes the BYE position's place in the matchUp beyond.
 */

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20715025 };
const DRAW_ID = 'participant-past-a-holders-bye';
const SCHEDULE = [
  { at: 'East|1|10', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { at: 'East|1|12', outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  { at: 'East|1|9', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
  { at: 'East|1|13', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
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
  // Which BYE a matchUp holding nobody but BYEs passes on is not settled by entry order (here `Northwest|2|1`, dp 3 or 4);
  // that is a separate question, outside this rule, so such a matchUp is compared without its positions.
  const byesOnly = (matchUp: any) =>
    matchUp.matchUpStatus === BYE && !(matchUp.sides ?? []).some((side: any) => side?.participantId);
  return {
    issueTypes: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
      (issue: any) => issue.issueType,
    ),
    draw: Object.fromEntries(
      matchUps.map((matchUp: any) => [
        coordinate(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          drawPositions: byesOnly(matchUp) ? undefined : matchUp.drawPositions,
          participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
        },
      ]),
    ),
  };
}

const forward = () => play([3, 2, 1, 0]);

it('double walkovers first: the defaulted carrier stands alone in South|3|1, awarded to the open seat', () => {
  const { issueTypes, draw } = forward();
  expect(issueTypes).toEqual([]);
  const carrier = draw['West|1|6'].participants[1];
  expect(draw['South|2|2']).toMatchObject({ matchUpStatus: BYE, participants: [carrier, BYE] });
  expect(draw['South|3|1']).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 1, drawPositions: [6] });
  expect(draw['South|3|1'].participants).toEqual([undefined, carrier]);
});

it('a carry replacing a dissolved produced exit releases the reservation it made', () => {
  const late = play([0, 1, 2, 3]);
  expect(late.issueTypes).toEqual([]);
  expect(late.draw).toEqual(forward().draw);
});

it("a participant passing a holder's BYE takes the BYE position's place one round on", () => {
  const late = play([0, 1, 3, 2]);
  expect(late.issueTypes).toEqual([]);
  expect(late.draw).toEqual(forward().draw);
});
