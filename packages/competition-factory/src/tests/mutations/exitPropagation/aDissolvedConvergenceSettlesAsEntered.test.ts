import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, CURTIS_CONSOLATION, OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE DISSOLVED BY A CORRECTION SETTLES WHERE ENTERING THE RESULT DIRECTLY PUTS IT (census P51 carry-past
 * family, correction side; policy-off seeds failing EXIT_CODE_ON_WINNER_SIDE, 2026-10-12).
 *
 * Each case enters an exit, then corrects it to a bare win for the same winner. Withdrawing the loser's carry
 * dissolves a convergence downstream, and the matchUp it leaves must be the one the played result entered first leaves:
 * status, winner and participants alike, with no exit code on the winning side.
 *
 * - **Pending** (20466254 COMPASS 32/27, 20488568 OLYMPIC 32/29): the kept exit is a double exit's produced walkover
 *   with nobody standing opposite. It lands pending (CA 2026-10-03, Q3); it was awarded to the empty seat, carrying the
 *   convergence's codes.
 * - **Codes** (20520641 CURTIS_CONSOLATION 16/11): the winner stands and is right; the withdrawn side's code went with
 *   its exit only in part, leaving one on the winner's side.
 * - **The held exit travels** (20500008 COMPASS 16/16): River's carried default had taken the seat a BYE's held
 *   walkover was owed. Withdrawn, it left nothing there, and the BYE's exit never travelled: a single WALKOVER where
 *   direct entry converges to a DOUBLE_WALKOVER. Since census S6 a loser seat already holding a BYE is settled and
 *   nothing is produced onto it, in every order: both routes leave `South|2|1` a WALKOVER won by the participant who
 *   reaches it (the DOUBLE_WALKOVER this pinned was reached by only part of the schedule's orders).
 *
 * Falsified: without `settleProducedExit` the pending and codes cases fail; without the relay to a passed occupant the
 * held-exit case does.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
type Step = [string, any];

const CASES: {
  name: string;
  config: any;
  steps: Step[];
  at: string;
  expected: { matchUpStatus: string; winnerStands: boolean };
}[] = [
  {
    name: 'pending: COMPASS 32/27 (20466254)',
    config: { drawType: COMPASS, participantsCount: 27, drawSize: 32, seed: 20466254 },
    at: 'South|3|1',
    expected: { matchUpStatus: WALKOVER, winnerStands: false },
    steps: [
      ['East|1|13', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['East|1|8', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['East|1|4', { winningSide: 2 }],
    ],
  },
  {
    name: 'pending: OLYMPIC 32/29 (20488568)',
    config: { drawType: OLYMPIC, participantsCount: 29, drawSize: 32, seed: 20488568 },
    at: 'South|2|1',
    expected: { matchUpStatus: WALKOVER, winnerStands: false },
    steps: [
      ['East|1|8', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['East|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['East|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['East|1|8', { winningSide: 1 }],
    ],
  },
  {
    name: 'codes: CURTIS_CONSOLATION 16/11 (20520641)',
    config: { drawType: CURTIS_CONSOLATION, participantsCount: 11, drawSize: 16, seed: 20520641 },
    at: 'Consolation 1|3|1',
    expected: { matchUpStatus: WALKOVER, winnerStands: true },
    steps: [
      ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|2', { winningSide: 2 }],
      ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main|1|5', { winningSide: 2 }],
      ['Main|2|3', { winningSide: 2 }],
      ['Main|2|3', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|2|3', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main|2|4', { winningSide: 1 }],
    ],
  },
  {
    name: 'the held exit travels: COMPASS 16/16 (20500008)',
    config: { drawType: COMPASS, participantsCount: 16, drawSize: 16, seed: 20500008 },
    at: 'South|2|1',
    expected: { matchUpStatus: WALKOVER, winnerStands: true },
    steps: [
      ['East|1|8', { winningSide: 1 }],
      ['East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['East|1|7', { winningSide: 1 }],
      ['East|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
      ['East|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['West|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['West|1|4', { winningSide: 1 }],
      ['East|2|4', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }],
    ],
  },
];

/** the steps with the corrected entry dropped: the played result entered first */
function direct(steps: Step[]): Step[] {
  const corrections = steps.map(([coordinates], index) =>
    steps.slice(0, index).some(([earlier]) => earlier === coordinates),
  );
  const correctionIndex = corrections.lastIndexOf(true);
  const corrected = steps[correctionIndex][0];
  const replaced = steps
    .slice(0, correctionIndex)
    .map(([coordinates]) => coordinates)
    .lastIndexOf(corrected);
  return steps.filter((_, index) => index !== replaced);
}

function play({ config, steps, drawId, at }: { config: any; steps: Step[]; drawId: string; at: string }) {
  setSubscriptions({});
  expect(prepareDraw({ ...config, propagateExitStatus: true }, drawId, POLICY_OFF)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const result = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.error, coordinates).toBeUndefined();
  }
  const matchUp = getDrawMatchUps(drawId).find((candidate: any) => key(candidate) === at);
  const participants = (matchUp.sides ?? []).map((side: any) => side?.participantId ?? null);
  const winner = matchUp.sides?.find((side: any) => side.sideNumber === matchUp.winningSide)?.participantId;
  const codes = matchUp.matchUpStatusCodes ?? [];
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? [];
  return { matchUp, participants, winner, codes, inconsistencies };
}

it.each(CASES)('$name', ({ config, steps, at, expected }) => {
  const entered = play({ config, steps: direct(steps), drawId: 'entered', at });
  const corrected = play({ config, steps, drawId: 'corrected', at });

  expect(corrected.matchUp.matchUpStatus).toEqual(expected.matchUpStatus);
  expect(!!corrected.winner).toEqual(expected.winnerStands);
  if (!expected.winnerStands) expect(corrected.matchUp.winningSide).toBeUndefined();
  // where entering the played result first puts it
  expect(corrected.matchUp.matchUpStatus).toEqual(entered.matchUp.matchUpStatus);
  expect(corrected.matchUp.winningSide).toEqual(entered.matchUp.winningSide);
  expect(corrected.participants).toEqual(entered.participants);
  // no reason badge beside the winner
  if (corrected.matchUp.winningSide)
    expect(corrected.codes[corrected.matchUp.winningSide - 1] || undefined).toBeUndefined();
  expect(corrected.inconsistencies).toEqual([]);
});
