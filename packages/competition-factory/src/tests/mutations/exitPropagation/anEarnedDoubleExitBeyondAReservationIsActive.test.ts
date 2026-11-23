import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

// constants
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';

/**
 * A DOUBLE EXIT TWO PARTICIPANTS EARNED BEYOND A FIRST_MATCHUP RESERVATION IS ACTIVE DOWNSTREAM, AS A WIN THERE IS
 * (census run-17 baseline STRUCTURAL_INVARIANT UNDECIDED_WITH_SCORE, FIRST_MATCH_LOSER_CONSOLATION 8/7 seed 20642361).
 *
 * `Main|2|1`'s loser had a prior win, so `Consolation|2|1`'s seat is a reservation BYE and the participant opposite it
 * goes on into `Consolation|3|1`, which is played: RETIRED 6-3, then corrected to a DOUBLE_DEFAULT. A winner change at
 * `Main|2|1` makes its loser a first-match loser who takes the reserved seat, which takes the consolation finalist back
 * out of `Consolation|3|1` and leaves it TO_BE_PLAYED holding the 6-3. The walk past a fed BYE counted the matchUp
 * beyond it as decided only by a `winningSide`, which a double exit never has; one that both participants earned there
 * is as decided as a win, so the change is refused as it is when that matchUp was won.
 */

const FIXTURE = path.join(
  __dirname,
  '../../fixtures/exitPropagation/anEarnedDoubleExitBeyondAReservationIsActive20642361.json',
);
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  { at: 'Main|1|2', outcome: { winningSide: 1 } },
  { at: 'Main|1|3', outcome: { winningSide: 2 } },
  { at: 'Main|2|1', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'Main|1|4', outcome: { winningSide: 1 } },
  { at: 'Consolation|1|2', outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 } },
  {
    at: 'Consolation|3|1',
    outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
  },
];
const DOUBLE_DEFAULT_FINAL = { at: 'Consolation|3|1', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } };
const FLIP_MAIN_2_1 = { at: 'Main|2|1', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } };

function play(schedule: { at: string; outcome: any }[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const observed = schedule.map(({ at, outcome }) => {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at);
    const result = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.thrown).toBeUndefined();
    return result;
  });
  const byCoordinate = Object.fromEntries(matchUps().map((matchUp) => [coordinate(matchUp), matchUp]));
  return { observed, byCoordinate };
}

it('a winner change feeding the reserved seat is refused once a double exit was earned beyond it', () => {
  expect(config.seed).toEqual(20642361);
  const { observed, byCoordinate } = play([...SCHEDULE, DOUBLE_DEFAULT_FINAL, FLIP_MAIN_2_1], 'earned-double');
  expect(observed.slice(0, -1).every((result) => !result.error)).toEqual(true);
  expect(observed.at(-1)?.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
  expect(byCoordinate['Main|2|1'].winningSide).toEqual(1);
  expect(byCoordinate['Consolation|2|1'].matchUpStatus).toEqual('BYE');
  expect(byCoordinate['Consolation|3|1'].matchUpStatus).toEqual('DOUBLE_DEFAULT');
  expect(byCoordinate['Consolation|3|1'].sides.filter((side: any) => side.participantId)).toHaveLength(2);
});

it('the same winner change is refused while the final stands as a win', () => {
  const { observed } = play([...SCHEDULE, FLIP_MAIN_2_1], 'earned-win');
  expect(observed.at(-1)?.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
});
