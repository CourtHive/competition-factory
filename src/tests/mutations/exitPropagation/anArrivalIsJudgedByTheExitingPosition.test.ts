import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * AN ARRIVAL OPPOSITE A PENDING EXIT IS JUDGED BY THE EXITING POSITION — census 20076847 (FEED_IN_CHAMPIONSHIP 16/11,
 * `doubleExitPropagateBye: false`), forward play only.
 *
 * `Main|2|4`'s double walkover carries a WALKOVER past `Consolation|2|4`'s BYE into `Consolation|3|2`, which holds dp 7
 * alone with the exit recorded on dp 7's bracket side, side 2. `Main|1|4`'s double default then makes `Consolation|2|3`
 * a BYE, and its participant (dp 12) comes through it. With both positions present the sides re-sort, the lower number
 * on side 1 (`draw-positions.md` rule 3): dp 7 is now side 1 and the arrival side 2 — the side the exit was recorded on.
 * Comparing that side number across the two frames read the arrival as one on the exiting side, so it took nothing,
 * and the matchUp stood TO_BE_PLAYED over the exit (PROPAGATED_EXIT_LOST) until a later result stalled the
 * consolation. The arrival is not the exiting position, and wins the walkover.
 */

const DRAW_ID = 'arrival-judged-by-the-exiting-position';

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
    drawType: FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: false,
    participantsCount: 11,
    seed: 20076847,
    drawSize: 16,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: at(key).matchUpId, drawId: DRAW_ID, outcome });
    expect(result.error).toBeUndefined();
  }
  const semifinal = at('Consolation|3|2');
  const winner = semifinal.sides?.find((side: any) => side.sideNumber === semifinal.winningSide);
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
    winnerIsParticipant: !!winner?.participantId,
    matchUpStatus: semifinal.matchUpStatus,
  };
}

const THROUGH_THE_DOUBLE_DEFAULT: [string, any][] = [
  ['Main|1|2', { winningSide: 1 }],
  ['Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|2|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|2|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }],
];

it('the participant coming through the late BYE wins the walkover standing opposite', () => {
  const result = play(THROUGH_THE_DOUBLE_DEFAULT);
  expect(result).toMatchObject({ matchUpStatus: WALKOVER, winnerIsParticipant: true });
  expect(result.issues).toEqual([]);
});

it('census 20076847: later results leave nobody waiting', () => {
  const result = play([
    ...THROUGH_THE_DOUBLE_DEFAULT,
    ['Consolation|3|1', { winningSide: 1 }],
    [
      'Main|4|1',
      {
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
        matchUpStatus: RETIRED,
        winningSide: 1,
      },
    ],
  ]);
  expect(result.issues).toEqual([]);
  expect(result.stalls).toEqual(0);
});
