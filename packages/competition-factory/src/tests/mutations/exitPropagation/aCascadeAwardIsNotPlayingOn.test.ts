import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A CASCADE AWARD IS NOT PLAYING ON — census 20012942 (DOUBLE_ELIMINATION 8/6).
 *
 * A relabel that withdraws one origin of a convergence is refused where the convergence's produced exit was won and
 * its winner has PLAYED ON (F2), because withdrawing it would leave a recorded result standing a round further on.
 * "Played on" read any exit status as a result, so a winner who had only ARRIVED opposite a carried walkover onward —
 * the cascade's own award — counted, and `Main|2|1`'s walkover relabelled as played left `Backdraw|2|1` a convergence
 * it no longer was. The Backdraw stalled, its winner never advanced, and the Main finalist waited alone.
 *
 * The corrected path must end where forward play ends.
 *
 * Read the other way, the refusal must still stand where the award's winner DID play on, however many awards onward
 * that result is (census de 9300887, below); and the withdrawal this now lets through leaves no exit code behind on a
 * matchUp it unwinds (policy-off w2 9100153, below).
 */

const DRAW_ID = 'cascade-award-is-not-playing-on';

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

const retired = {
  matchUpStatus: RETIRED,
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
};

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 6,
    seed: 20012942,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const state = (key: string) => {
    const matchUp = at(key);
    return {
      participants: matchUp.sides.map((side: any) => side.participantId ?? null),
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
    };
  };
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    matchUps: ['Backdraw|2|1', 'Backdraw|3|1', 'Backdraw|4|1', 'Main|4|1'].map(state),
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    errors: inconsistencies.filter((inconsistency: any) => inconsistency.severity === 'error').length,
  };
}

it('census 20012942: a relabel is not refused by a winner who only arrived opposite a carried exit', () => {
  const corrected = play([
    ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Main|1|2', retired],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Backdraw|2|2', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Backdraw|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|1|3', { winningSide: 1 }],
  ]);
  const direct = play([
    ['Main|1|2', retired],
    ['Main|1|3', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Backdraw|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ]);

  expect(direct.stalls).toEqual(0);
  expect(corrected).toEqual(direct);
});

/** a frozen schedule replayed as the census replays it: a step is taken only while its matchUp holds two participants */
function replay(config: any, steps: [string, any][], policyDefinitions?: any) {
  setSubscriptions({});
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  let last: any;
  for (const [key, outcome] of steps) {
    const target = at(key);
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    last = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      drawId: DRAW_ID,
      outcome,
    });
  }
  return last;
}

/**
 * A CASCADE AWARD IS PASSED THROUGH, NOT STOPPED AT — census de 9300887 (DOUBLE_ELIMINATION 8/4). The award's winner
 * may have played on from where it put them: here the Backdraw final was awarded by a carried walkover and its winner
 * then lost the RECORDED Main final. Relabelling `Main|2|2`'s default as a retirement must not withdraw the carry that
 * awarded it — the refusal stands — and the later relabel of `Main|2|1` is then taken without a refusal over a mutated
 * draw (ERR_EXISTING_POSITION_ASSIGNMENT).
 */
const DE_9300887: [string, any][] = [
  ['Main|2|2', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
  ['Main|2|1', { winningSide: 1 }],
  ['Main|2|2', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
  ['Main|3|1', { matchUpStatus: 'DOUBLE_WALKOVER' }],
  ['Main|3|1', { winningSide: 2 }],
  ['Main|3|1', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
  [
    'Backdraw|3|1',
    {
      matchUpStatus: 'RETIRED',
      winningSide: 1,
      score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
    },
  ],
  ['Main|4|1', { winningSide: 2 }],
  ['Main|4|1', { winningSide: 1 }],
  ['Backdraw|4|1', { winningSide: 2 }],
  [
    'Main|2|2',
    {
      matchUpStatus: 'RETIRED',
      winningSide: 1,
      score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
    },
  ],
  ['Main|2|1', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
];

it('census de 9300887: a relabel is refused where the award winner played on beyond it', () => {
  const last = replay(
    { participantsCount: 4, propagateExitStatus: true, drawSize: 8, drawType: 'DOUBLE_ELIMINATION', seed: 9300887 },
    DE_9300887,
  );
  expect(last?.error).toBeUndefined();
  const errors = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.severity === 'error',
  );
  expect(errors).toEqual([]);
});

/**
 * NO EXIT CODE IS LEFT ON THE WINNER'S SIDE — census w2 9100153 (FIRST_ROUND_LOSER_CONSOLATION 16/11,
 * `doubleExitPropagateBye: false`). `Consolation|3|1` converged two produced exits; withdrawing one re-derived it to
 * the other's single exit and kept the withdrawn side's `WO`, and a later unwind to TO_BE_PLAYED kept the other's
 * `DEF`. Each code then stood on the side that went on to win (EXIT_CODE_ON_WINNER_SIDE).
 */
const W2_9100153: [string, any][] = [
  ['Main|1|7', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
  ['Main|2|1', { winningSide: 2 }],
  ['Main|1|5', { winningSide: 2 }],
  ['Consolation|2|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
  ['Main|1|4', { matchUpStatus: 'DOUBLE_DEFAULT' }],
  ['Consolation|2|2', { matchUpStatus: 'DOUBLE_DEFAULT' }],
  ['Main|1|5', { matchUpStatus: 'DOUBLE_DEFAULT' }],
  ['Main|2|3', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
  ['Main|2|1', { winningSide: 2 }],
  ['Main|1|5', { winningSide: 2 }],
  ['Main|1|7', { winningSide: 2 }],
  ['Main|2|4', { winningSide: 2 }],
  ['Main|2|3', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
  ['Main|1|4', { winningSide: 1 }],
  ['Main|1|5', { winningSide: 1 }],
  ['Main|2|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
  ['Main|1|7', { winningSide: 1 }],
  ['Main|2|4', { winningSide: 1 }],
  ['Consolation|2|2', { winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
  ['Main|2|3', { winningSide: 1 }],
  ['Main|3|1', { winningSide: 1 }],
  ['Consolation|2|2', { winningSide: 2 }],
  ['Main|1|4', { winningSide: 2 }],
  ['Consolation|2|2', { matchUpStatus: 'DOUBLE_DEFAULT' }],
  ['Main|1|5', { winningSide: 2 }],
  ['Main|1|4', { winningSide: 2 }],
  ['Main|2|3', { winningSide: 1 }],
  ['Main|2|3', { winningSide: 1 }],
  ['Main|2|4', { winningSide: 2 }],
];

it('census w2 9100153: a withdrawn or unwound exit takes its code with it', () => {
  replay(
    {
      participantsCount: 11,
      propagateExitStatus: true,
      drawSize: 16,
      drawType: 'FIRST_ROUND_LOSER_CONSOLATION',
      seed: 9100153,
    },
    W2_9100153,
    { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
  );
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).not.toContain('EXIT_CODE_ON_WINNER_SIDE');
});
