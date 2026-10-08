import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A DOUBLE EXIT RE-ENTERED PRODUCES AGAIN — census w1 9000168 (FEED_IN_CHAMPIONSHIP_TO_SF 8/7,
 * `doubleExitPropagateBye: false`).
 *
 * With the policy off, a double exit's loser target is given a produced exit rather than a BYE. Re-entering
 * `Main|1|3`'s DOUBLE_WALKOVER as a DOUBLE_DEFAULT runs the advancement again, and `Consolation|1|2` already holds the
 * exit the first entry produced. It was read as a SECOND arrival and converged with itself: a DOUBLE_WALKOVER with one
 * origin and nobody in it, which the participant who later arrived opposite it could never leave. Entered directly, the
 * same result produces a DEFAULTED that whoever arrives wins.
 */

const DRAW_ID = 'double-exit-reentered';
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

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
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    propagateExitStatus: true,
    participantsCount: 7,
    seed: 9000168,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID, POLICY_OFF)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const target = at('Consolation|1|2');
  return {
    target: {
      participants: target.sides.map((side: any) => side.participantId ?? null),
      matchUpStatus: target.matchUpStatus,
      winningSide: target.winningSide,
    },
    stalls: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
      (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
    ).length,
  };
}

it('re-entered as the other double exit, the loser target holds one produced exit, as entered directly', () => {
  const direct = play([['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }]]);
  const reentered = play([
    ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }],
  ]);
  expect(direct.target).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 2 });
  expect(reentered).toEqual(direct);
});

/**
 * The frozen schedule's first twenty steps, replayed as the census replays them: a step is taken only while its
 * matchUp holds two participants, and a refusal is part of the schedule.
 */
const SCHEDULE: [string, any][] = [
  ['Main|1|4', { winningSide: 2 }],
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { winningSide: 1 }],
  ['Main|1|4', { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } }],
  ['Main|1|3', { winningSide: 2 }],
  ['Main|2|1', { winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { winningSide: 1 }],
  ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|2|1', { matchUpStatus: RETIRED, winningSide: 1 }],
  ['Main|2|1', { winningSide: 1 }],
  ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|1|4', { winningSide: 1 }],
  ['Consolation|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Consolation|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|3|1', { winningSide: 1 }],
];

it('census w1 9000168: the participant who arrives there wins it and the draw does not stall', () => {
  setSubscriptions({});
  const config = {
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    propagateExitStatus: true,
    participantsCount: 7,
    seed: 9000168,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID, POLICY_OFF)).toEqual(true);
  for (const [key, outcome] of SCHEDULE) {
    const target = at(key);
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
  }
  const consolation = at('Consolation|1|2');
  expect(consolation).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 2 });
  expect(consolation.sides.find((side: any) => side.sideNumber === 2)?.participantId).toBeTruthy();
  const stalls = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );
  expect(stalls.length).toEqual(0);
});
