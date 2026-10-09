import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A PENDING CARRY COMES HOME WITH ITS CARRIER — census 20057285 (FIRST_ROUND_LOSER_CONSOLATION 8/8,
 * `allowChangePropagation`), P50; found by the checkpoint differential (#5341).
 *
 * Waterhouse loses `Main|1|2` by walkover and carries it into `Consolation|1|1`. `Main|1|1`'s double default has
 * already placed a BYE on the other seat, so he is BYE-advanced to `Consolation|2|1`, and his carry stands there,
 * pending over the empty seat (`WALKOVER ws=2`: the side without the exit wins, even empty). Re-scoring `Main|1|1` as
 * a walkover win withdraws that BYE and sends Illich, its loser, into `Consolation|1|1` carrying his own walkover.
 * Waterhouse is pulled back — and his carry was not: `Consolation|2|1` went back to `TO_BE_PLAYED` with no origin,
 * and `Consolation|1|1` was written `WALKOVER ws=2`, Waterhouse winning a match he walked over off Illich's walkover.
 *
 * Two carried exits meeting converge (RULE 4): `Consolation|1|1` is a `DOUBLE_WALKOVER` with no winner, and it
 * produces a walkover into `Consolation|2|1`, pending there. Entered that way from the start, that is what stands;
 * the same shape where the carry had DECIDED its onward matchUp (census 20178071) already came home.
 */

const DRAW_ID = 'a-pending-carry-comes-home-with-its-carrier';

const at = (key: string): any => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === Number(roundNumber) &&
        matchUp.roundPosition === Number(roundPosition),
    );
};

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: FIRST_ROUND_LOSER_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 20057285,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
  }
  const view = (key: string) => {
    const { matchUpStatus, winningSide, sides } = at(key);
    return {
      participants: (sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      matchUpStatus,
      winningSide,
    };
  };
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    consolation: { first: view('Consolation|1|1'), second: view('Consolation|2|1') },
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
  };
}

const DIRECT: [string, any][] = [
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

// the census's order: the walkover re-entered after a reset, with the loser target already BYE-held by the double default
const CORRECTED: [string, any][] = [
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|2', { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } }],
  ['Main|1|1', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

it('two walkover losers meet in the consolation: a double walkover, however the double default came and went', () => {
  const direct = play(DIRECT);
  const corrected = play(CORRECTED);
  expect(direct.consolation.first).toMatchObject({ matchUpStatus: DOUBLE_WALKOVER, winningSide: undefined });
  expect(direct.consolation.second).toMatchObject({ matchUpStatus: WALKOVER, winningSide: undefined });
  expect(corrected.consolation).toEqual(direct.consolation);
  expect(corrected.issues).toEqual([]);
});
