import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEAD_RUBBER, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A DECIDER THE CASCADE RE-SEATS IS SETTLED, though the final's winner did not change — census 20012480
 * (DOUBLE_ELIMINATION 8/5, both `allowChangePropagation` arms).
 *
 * `Backdraw|3|1` is a DOUBLE_DEFAULT, so the Backdraw sends no champion and the Main winner wins the final by the
 * produced DEFAULTED; the decider is a DEAD_RUBBER (CA, 2026-09-29). Re-entered as a DOUBLE_WALKOVER, the produced exit
 * re-derives to a WALKOVER — the SAME winner — and the unwind re-seats that winner in the decider as `TO_BE_PLAYED`.
 * `reconcileDecider` acted only on a change of the final's `winningSide`, so it never ran, and the winner waited alone.
 *
 * It now also runs when the cascade changed a decider structure — but never when the mutation was OF the decider:
 * clearing a DEAD_RUBBER to play the decider "just for fun" stays, which is the rule's third clause.
 */

const DRAW_ID = 'decider-reseated';

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

const score = (key: string, outcome: any) => {
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: at(key).matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
    outcome,
  });
  expect(result.error).toBeUndefined();
};

function setup(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 5,
    seed: 20012480,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) score(key, outcome);
}

const LEAD: [string, any][] = [
  ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { winningSide: 1 }],
  ['Main|2|1', { winningSide: 2 }],
];

const stalls = () =>
  (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  ).length;

it('census 20012480: a double exit re-entered as the other double exit leaves the decider a DEAD_RUBBER', () => {
  setup([...LEAD, ['Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER }]]);
  const direct = { final: at('Main|4|1').winningSide, decider: at('Decider|1|1').matchUpStatus };

  setup([
    ...LEAD,
    ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  const corrected = { final: at('Main|4|1').winningSide, decider: at('Decider|1|1').matchUpStatus };

  expect(direct).toEqual({ final: 2, decider: DEAD_RUBBER });
  expect(corrected).toEqual(direct);
  expect(stalls()).toEqual(0);
});

it('a decider cleared to be played for fun is not settled back by the rule', () => {
  setup([...LEAD, ['Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER }]]);
  expect(at('Decider|1|1').matchUpStatus).toEqual(DEAD_RUBBER);

  score('Decider|1|1', { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } });
  expect(at('Decider|1|1').matchUpStatus).toEqual(TO_BE_PLAYED);
});
