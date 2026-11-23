import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A PENDING EXIT'S RESERVATION GOES WITH IT, EVEN ONCE A BYE HAS TAKEN THE SEAT — census 20178071 (FEED_IN_CHAMPIONSHIP
 * 8/7, both default arms), fourth at-scale run.
 *
 * `Main|1|3`'s DEFAULTED and `Main|1|4`'s WALKOVER send two carriers into `Consolation|1|2`; they converge, and the
 * convergence produces an exit, pending, into `Consolation|2|2`, whose fed seat dp 3 is empty: that seat is advanced into
 * `3|1` as a reservation for whoever falls through. `Main|2|1`'s double walkover then puts a BYE in dp 3. Clearing
 * `Main|1|3` dissolves the convergence and withdraws the produced exit — but `Consolation|2|2` was a BYE by then, the
 * withdrawal reported nothing, and the release that takes a pending exit's reservation back never ran; where it did run,
 * dp 3 read as "advanced by a BYE" and was kept. `3|1` read BYE over a seat nothing had earned, and the carrier later
 * coming through `2|2` past the BYE met it there (TWO_POSITIONS_FROM_ONE_FEEDER): a stall. Entered directly, `3|1` is
 * empty and to be played, the BYE waiting in `2|2` for `1|2`'s winner.
 */

const DRAW_ID = 'pending-exits-reservation-goes-with-it';
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

function play(steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const draw = getDrawMatchUps(DRAW_ID)
    .map(({ structureName, roundNumber, roundPosition, matchUpStatus, winningSide, drawPositions, sides }: any) => ({
      key: `${structureName}|${roundNumber}|${roundPosition}`,
      participants: (sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      drawPositions,
      matchUpStatus,
      winningSide,
    }))
    .sort((a: any, b: any) => a.key.localeCompare(b.key));
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  return { draw, issues };
}

const FIRST: [string, any] = ['Main|1|2', { winningSide: 1 }];
const LATER: [string, any][] = [
  ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
];
const CLEAR = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

it('the produced exit withdrawn with its convergence takes its reservation back, as entered directly', () => {
  const direct = play([FIRST, ...LATER]);
  const corrected = play([
    FIRST,
    ['Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ...LATER,
    ['Main|1|3', CLEAR],
  ]);
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
  // the BYE waits in round 2 for `1|2`'s winner; the seat it had been advanced into is empty and to be played
  const seat = (key: string) => corrected.draw.find((matchUp) => matchUp.key === key);
  expect(seat('Consolation|2|2')).toMatchObject({ matchUpStatus: BYE, drawPositions: [3] });
  expect(seat('Consolation|3|1')).toMatchObject({ matchUpStatus: TO_BE_PLAYED, winningSide: undefined });
  expect(seat('Consolation|3|1')?.drawPositions ?? []).toEqual([]);
});
