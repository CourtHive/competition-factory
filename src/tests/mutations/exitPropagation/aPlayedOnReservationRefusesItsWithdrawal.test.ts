import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

// constants
import { CANNOT_CHANGE_FEED_ELIGIBILITY } from '@Constants/errorConditionConstants';

/**
 * A MAIN-DRAW CHANGE MAY NOT PERCOLATE INTO A BACKDRAW THAT HAS STARTED (CA 2026-09-22), AND A RESULT RE-SCORED BY THE
 * SAME WINNER IS SUCH A CHANGE WHEN IT TAKES BACK A RESERVATION THAT HAS BEEN PLAYED ON (census run-17 baseline
 * STRUCTURAL_INVARIANT UNDECIDED_WITH_SCORE, FIRST_MATCH_LOSER_CONSOLATION 8/8 seed 20624031, every arm).
 *
 * `Main|1|1` and `Main|1|2` are both played wins, so whoever loses `Main|2|1` will have a prior win and may not enter:
 * `Consolation|2|1`'s seat is reserved with a BYE, and `Consolation|1|1`'s winner goes on past it. Once they have
 * played `Consolation|3|1`, re-scoring `Main|1|2` to a WALKOVER by the same winner withdrew the reservation, took them
 * back out of the final and left it TO_BE_PLAYED holding their RETIRED 6-3. The winner is unchanged, so
 * `CANNOT_CHANGE_WINNING_SIDE` never asked; the feed-eligibility guard refuses it, as it refuses the same flip once the
 * feeding round's loser has been directed.
 */

const FIXTURE = path.join(
  __dirname,
  '../../fixtures/exitPropagation/aPlayedOnReservationRefusesItsWithdrawal20624031.json',
);
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED_6_3 = { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const SCHEDULE = [
  { at: 'Main|1|1', outcome: { winningSide: 1 } },
  { at: 'Main|1|2', outcome: { winningSide: 2 } },
  { at: 'Consolation|1|1', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
  { at: 'Main|1|4', outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 } },
  { at: 'Main|1|3', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
];
const CONSOLATION_FINAL = { at: 'Consolation|3|1', outcome: RETIRED_6_3 };
const RELABEL_MAIN_1_2 = { at: 'Main|1|2', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } };

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

it('re-scoring a reserving win to a walkover is refused once the reservation has been played on', () => {
  expect(config.seed).toEqual(20624031);
  const before = play([...SCHEDULE, CONSOLATION_FINAL], 'played-on-before');
  expect(before.observed.every((result) => !result.error)).toEqual(true);
  expect(before.byCoordinate['Consolation|2|1'].matchUpStatus).toEqual('BYE');

  const { observed, byCoordinate } = play([...SCHEDULE, CONSOLATION_FINAL, RELABEL_MAIN_1_2], 'played-on-relabel');
  expect(observed.at(-1)?.error).toEqual(CANNOT_CHANGE_FEED_ELIGIBILITY);
  expect(byCoordinate['Main|1|2'].matchUpStatus).toEqual('COMPLETED');
  expect(byCoordinate['Consolation|3|1'].matchUpStatus).toEqual('RETIRED');
  expect(byCoordinate['Consolation|3|1'].sides.map((side: any) => side.participantId)).toEqual(
    before.byCoordinate['Consolation|3|1'].sides.map((side: any) => side.participantId),
  );
});

it('the same re-score before the reservation is played on withdraws it', () => {
  const { observed, byCoordinate } = play([...SCHEDULE, RELABEL_MAIN_1_2], 'not-played-on');
  expect(observed.every((result) => !result.error)).toEqual(true);
  expect(byCoordinate['Main|1|2'].matchUpStatus).toEqual('WALKOVER');
  expect(byCoordinate['Consolation|2|1'].matchUpStatus).toEqual('TO_BE_PLAYED');
});

it('under allowChangePropagation, a swapped winner re-scored to a walkover is refused the same way', () => {
  // seeds 20701220 and 20750479: the swap takes the reservation back exactly as the relabel does
  const previous = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  try {
    const swap = { at: 'Main|1|2', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } };
    const { observed, byCoordinate } = play([...SCHEDULE, CONSOLATION_FINAL, swap], 'played-on-swap');
    expect(observed.at(-1)?.error).toEqual(CANNOT_CHANGE_FEED_ELIGIBILITY);
    expect(byCoordinate['Main|1|2'].winningSide).toEqual(2);
    expect(byCoordinate['Consolation|3|1'].matchUpStatus).toEqual('RETIRED');
  } finally {
    if (previous === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
    else process.env.ALLOW_CHANGE_PROPAGATION = previous;
  }
});
