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
 * A CONVERGENCE WRITTEN BY AN ARRIVAL PRODUCES ONWARD — census 20080614 (FEED_IN_CHAMPIONSHIP 16/11,
 * `doubleExitPropagateBye: false`), forward play only.
 *
 * `Main|1|5`'s double walkover leaves a produced WALKOVER pending at `Consolation|3|2`. `Main|1|2`'s double default
 * then sends a participant carrying an exit through a BYE into it: the two converge (RULE 4) and `Consolation|3|2` is a
 * DOUBLE_WALKOVER. A convergence produces an exit for its winner target; written by this route it produced nothing,
 * and the Main semifinal's loser, fed into `Consolation|4|2`, waited on nobody — as, after the Main final, did the
 * consolation's later rounds.
 */

const DRAW_ID = 'an-arrivals-convergence-produces-onward';

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
    propagateExitStatus: true,
    participantsCount: 11,
    seed: 20080614,
    drawSize: 16,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const fed = at('Consolation|4|2');
  const winner = fed.sides?.find((side: any) => side.sideNumber === fed.winningSide);
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
    convergence: at('Consolation|3|2').matchUpStatus,
    fedWinnerIsParticipant: !!winner?.participantId,
    fedStatus: fed.matchUpStatus,
  };
}

const TO_THE_CONVERGENCE: [string, any][] = [
  ['Main|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }],
  [
    'Main|2|4',
    {
      score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      matchUpStatus: RETIRED,
      winningSide: 1,
    },
  ],
  ['Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|3|2', { winningSide: 1 }],
  ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
];

it("the convergence's exit reaches the Main semifinal loser fed into the next round, who is awarded it", () => {
  const result = play(TO_THE_CONVERGENCE);
  expect(result).toMatchObject({ convergence: DOUBLE_WALKOVER, fedStatus: WALKOVER, fedWinnerIsParticipant: true });
  expect(result.issues).toEqual([]);
});

it('census 20080614: after the Main final nobody waits', () => {
  const result = play([...TO_THE_CONVERGENCE, ['Main|4|1', { winningSide: 2 }]]);
  expect(result.issues).toEqual([]);
  expect(result.stalls).toEqual(0);
});
