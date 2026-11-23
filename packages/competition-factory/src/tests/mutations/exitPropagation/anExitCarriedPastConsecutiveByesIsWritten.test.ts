import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * AN EXIT CARRIED PAST CONSECUTIVE LATE BYES IS WRITTEN WHERE THE CARRIER LANDS — census 20178071 (FEED_IN_CHAMPIONSHIP
 * 8/7), forward play.
 *
 * `Main|1|4`'s walkover loser enters `Consolation|1|2` carrying it and waits for `Main|1|3`'s loser. `Main|2|1`'s double
 * walkover puts a BYE in `2|2`'s fed seat; then `Main|1|3`'s double walkover puts a BYE in the seat beside the carrier.
 * That late BYE advances them — past `1|2`, and at once past the BYE in `2|2` — into `3|1`. `reconcileCarriesPastByes`
 * looked for the carrier one round on, found `2|2`, a BYE matchUp they had already passed, and wrote nothing: the
 * walkover they carried was recorded at `1|2` and nowhere they stood. Their opponent in `3|1` was given a match against
 * somebody who had withdrawn, where the correction path (which replays the carry) awards the walkover.
 *
 * The carrier is followed to the furthest round they stand in; the carry is the forward rule's own, replayed from the
 * BYE matchUp through every BYE between.
 */

const DRAW_ID = 'exit-carried-past-consecutive-byes';
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

it('a carrier advanced through two byes by a late bye reaches the final with the walkover they carry', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toEqual(true);
  enter('Main|1|2', { winningSide: 1 });
  enter('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 });
  const [carrier] = participants('Consolation|1|2').filter(Boolean);
  expect(carrier).toBeDefined();
  enter('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });
  enter('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER });

  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);

  // the carrier came through `1|2` and `2|2`, both BYE matchUps now, into the final
  expect(at('Consolation|1|2').matchUpStatus).toEqual(BYE);
  expect(at('Consolation|2|2').matchUpStatus).toEqual(BYE);
  const final = at('Consolation|3|1');
  expect(participants('Consolation|3|1')).toContain(carrier);
  // ...and the walkover they carry decides it for their opponent, who goes on
  expect(final.matchUpStatus).toEqual(WALKOVER);
  const winner = final.sides.find((side: any) => side.sideNumber === final.winningSide)?.participantId;
  expect(winner).toBeDefined();
  expect(winner).not.toEqual(carrier);
  expect(participants('Consolation|4|1')).toContain(winner);
});
