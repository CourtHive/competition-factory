import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A BYE'S OPPONENT GOES ON ONCE THE SEAT IS FREE — census 20178071 (FEED_IN_CHAMPIONSHIP 8/7, both default arms),
 * fourth at-scale run; the second half of that stall.
 *
 * `Main|1|3`'s DEFAULTED and `Main|1|4`'s WALKOVER converge in `Consolation|1|2`; the convergence produces an exit into
 * `2|2`, whose empty fed seat is advanced into `3|1` as a reservation. Re-scoring `Main|1|3` as a double walkover does
 * three things in one mutation: a BYE lands beside `2|1`'s occupant, whose next seat in `3|1` is still the reservation
 * (full — nowhere to go); the carrier from `1|2` passes two BYEs into `3|1`; and, once the draw settles, the dissolved
 * convergence's reservation is withdrawn (`aPendingExitsReservationGoesWithIt`), freeing the seat. Nothing came back
 * for the occupant: BYE_ADVANCEMENT_MISSING at `2|1`, and the consolation final could not be played.
 *
 * Asked of the settled draw, the occupant goes on into the freed seat, and takes the walkover the carrier brought.
 */

const DRAW_ID = 'byes-opponent-goes-on-once-the-seat-is-free';
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 7,
  seed: 20178071,
  drawSize: 8,
};

const at = (key: string): any =>
  getDrawMatchUps(DRAW_ID).find(
    (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}` === key,
  );

function enter(key: string, outcome: any) {
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: at(key).matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
    outcome,
  });
  expect(result.error).toBeUndefined();
}

const participants = (key: string) =>
  (at(key).sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined));

it('once the reservation its next seat held is withdrawn, the participant opposite the bye is advanced into it', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toEqual(true);
  enter('Main|1|2', { winningSide: 1 });
  enter('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 });
  enter('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });
  enter('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER });

  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);

  // `2|1`'s occupant stands opposite a BYE, and now also in `3|1`, opposite the carrier who came through `1|2` and `2|2`
  const [occupant] = participants('Consolation|2|1').filter((participantId: string) => participantId !== BYE);
  const [carrier] = participants('Consolation|1|2').filter((participantId: string) => participantId !== BYE);
  expect(occupant).toBeDefined();
  expect(carrier).toBeDefined();
  expect(participants('Consolation|3|1').sort((a: string, b: string) => a.localeCompare(b))).toEqual(
    [occupant, carrier].sort((a, b) => a.localeCompare(b)),
  );
  // ...and takes the walkover the carrier brought, going on to the final
  const final = at('Consolation|3|1');
  expect(final.matchUpStatus).toEqual(WALKOVER);
  expect(final.sides.find((side: any) => side.sideNumber === final.winningSide)?.participantId).toEqual(occupant);
  expect(participants('Consolation|4|1')).toContain(occupant);
});
