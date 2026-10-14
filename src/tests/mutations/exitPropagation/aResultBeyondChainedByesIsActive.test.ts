import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

// constants
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';

/**
 * A RESULT BEYOND A CHAIN OF BYES IS ACTIVE DOWNSTREAM OF THE MATCHUP WHOSE LOSER SEAT BEGINS IT (census run-17 baseline
 * STRUCTURAL_INVARIANT UNDECIDED_WITH_SCORE, FIRST_MATCH_LOSER_CONSOLATION 16/11 seed 20653720).
 *
 * `Main|2|4`'s double default leaves `Consolation|2|4` a BYE beside a BYE, which goes on into `Consolation|3|2`'s seat;
 * the participant opposite that BYE goes on again and plays `Consolation|4|1`. Re-scoring the double default to a win
 * feeds its loser into the seat, which takes that participant back out of `Consolation|4|1` and leaves it TO_BE_PLAYED
 * with its RETIRED 6-3. The walk past a fed BYE asked only the matchUp one round on, itself a BYE, and read the chain as
 * inert; it now asks the first matchUp beyond the BYEs, so the re-score is refused as it is one round nearer.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aResultBeyondChainedByesIsActive20653720.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED_6_3 = { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const SCHEDULE = [
  { at: 'Main|1|4', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
  { at: 'Main|1|2', outcome: RETIRED_6_3 },
  { at: 'Main|2|1', outcome: { winningSide: 2 } },
  { at: 'Main|2|4', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
  { at: 'Main|1|5', outcome: { winningSide: 1 } },
  { at: 'Consolation|2|1', outcome: { winningSide: 2 } },
  { at: 'Main|2|3', outcome: { winningSide: 2 } },
];
const CONSOLATION_SEMIFINAL = { at: 'Consolation|4|1', outcome: RETIRED_6_3 };
const RESCORE_MAIN_2_4 = { at: 'Main|2|4', outcome: { winningSide: 1 } };

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

it('re-scoring the double exit is refused once the participant past the BYEs has played on', () => {
  expect(config.seed).toEqual(20653720);
  const { observed, byCoordinate } = play([...SCHEDULE, CONSOLATION_SEMIFINAL, RESCORE_MAIN_2_4], 'chained-played');
  expect(observed.slice(0, -1).every((result) => !result.error)).toEqual(true);
  expect(byCoordinate['Consolation|3|2'].matchUpStatus).toEqual('BYE');
  expect(observed.at(-1)?.error).toEqual(CANNOT_CHANGE_OUTCOME);
  expect(byCoordinate['Main|2|4'].matchUpStatus).toEqual('DOUBLE_DEFAULT');
  expect(byCoordinate['Consolation|4|1'].matchUpStatus).toEqual('RETIRED');
});

it('the same re-score is accepted while nobody has played past the BYEs', () => {
  const { observed, byCoordinate } = play([...SCHEDULE, RESCORE_MAIN_2_4], 'chained-unplayed');
  expect(observed.every((result) => !result.error)).toEqual(true);
  expect(byCoordinate['Main|2|4'].winningSide).toEqual(1);
});
