import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { checkMonotonicity } from '@Tests/testHarness/exitPropagation/properties';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A DISSOLVED PRODUCER WITHDRAWS ITS PENDING EXIT, AND THAT IS NOT AN ARRIVAL CLEARING ONE — census w1 9000249
 * (OLYMPIC 32, `doubleExitPropagateBye: false`), frozen window.
 *
 * `East|1|5` and `East|1|6` are walkovers, so both losers enter `West|1|3` carrying them; the two converge, and the
 * convergence produces a WALKOVER, pending, into `West|2|2`. Re-scoring `East|1|6` as a played win sends a loser who
 * did play: the convergence dissolves, they win `West|1|3` on the walkover still carried opposite, and come through to
 * `West|2|2`, where the produced exit is gone with its producer and they wait for `West|1|4`'s winner — the draw the
 * same results entered directly reach. MONOTONIC_DECISION reported the pending exit's withdrawal as an arrival clearing
 * it, because someone sat in the seat afterwards.
 */

const DRAW_ID = 'dissolved-producer-withdraws-its-pending-exit';
const POLICY = { progression: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: OLYMPIC, drawSize: 32, participantsCount: 32, propagateExitStatus: true, seed: 9000249 };

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

function westSeat() {
  const { matchUpStatus, winningSide, sides } = at('West|2|2');
  return { matchUpStatus, winningSide, participants: sides.filter((side: any) => side?.participantId).length };
}

function prepare() {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  enter('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 });
}

it('the re-score that dissolves the convergence withdraws its pending exit, and no decision is reported lost', () => {
  prepare();
  enter('East|1|6', { matchUpStatus: WALKOVER, winningSide: 1 });
  expect(westSeat()).toEqual({ matchUpStatus: WALKOVER, winningSide: undefined, participants: 0 });

  const failures = checkMonotonicity({
    matchUpId: at('East|1|6').matchUpId,
    outcome: { winningSide: 2 },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(failures).toEqual([]);
  const corrected = westSeat();
  expect(corrected).toEqual({ matchUpStatus: TO_BE_PLAYED, winningSide: undefined, participants: 1 });

  prepare();
  enter('East|1|6', { winningSide: 2 });
  expect(westSeat()).toEqual(corrected);
});
