import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A RELABEL WITHDRAWS A CARRY WHOSE WINNER MATCHUP HOLDS A PENDING PRODUCED EXIT — census policy-off 20162213
 * (MODIFIED_FEED_IN_CHAMPIONSHIP 8/5, `doubleExitPropagateBye: false`), fourth at-scale run.
 *
 * `Main|1|2`'s walkover loser carries it through `Consolation|1|1`'s BYE into `2|1`, pending. `Main|2|1`'s double
 * walkover then, with the policy off, produces a WALKOVER into the consolation instead of a BYE, relayed past `2|2`'s
 * BYE to rest in `3|1` — the matchUp `2|1`'s winner goes on to. Re-scoring `Main|1|2` as a played win by the same winner
 * should withdraw the carry: the loser lost a match, not a walkover. `winnerPlayedOn` asked whether the carry's winner
 * had a result onward, and `hasEarnedResult` read `3|1`'s pending exit — no winner, nobody arrived, nobody entered it —
 * as one a director had recorded, so the relabel was refused. The stale walkover stayed on `2|1`, the next loser to
 * arrive "converged" with it, and the final waited on a winner who was never advanced (STALLED_POSITION,
 * WINNER_NOT_ADVANCED). Under the default policy `3|1` is a BYE, and the same relabel withdraws the carry.
 *
 * An exit with no winner that records the exit it was produced or carried from is the cascade's own, not an earned
 * result; withdrawing past it leaves the draw the same results entered played from the start reach.
 */

const DRAW_ID = 'relabel-withdraws-past-a-pending-produced-exit';
const CONFIG = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 5,
  seed: 20162213,
  drawSize: 8,
};
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const at = (key: string): any =>
  getDrawMatchUps(DRAW_ID).find(
    (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}` === key,
  );
const raw = (key: string): any =>
  (getDrawDefinition(DRAW_ID) as any).structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === at(key).matchUpId);

function play(steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
  }
  const consolation = getDrawMatchUps(DRAW_ID)
    .filter((matchUp: any) => matchUp.structureName === 'Consolation')
    .map(({ roundNumber, roundPosition, matchUpStatus, winningSide, sides }: any) => ({
      key: `${roundNumber}|${roundPosition}`,
      participants: (sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      matchUpStatus,
      winningSide,
    }))
    .sort((a: any, b: any) => a.key.localeCompare(b.key));
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  return { consolation, issues };
}

it('re-scored as played, the walkover its loser carried is withdrawn although a produced exit stands one round on', () => {
  play([
    ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  expect(at('Consolation|2|1').matchUpStatus).toEqual(WALKOVER);
  expect(at('Consolation|3|1').matchUpStatus).toEqual(WALKOVER);
  expect(at('Consolation|3|1').winningSide).toBeUndefined();

  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: at('Main|1|2').matchUpId,
    outcome: { winningSide: 1 },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();
  // the loser lost a match, not a walkover: nothing is carried, and the pending produced exit onward stands as it was
  expect(at('Consolation|2|1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(getSideExitProvenance({ matchUp: raw('Consolation|2|1') })).toBeUndefined();
  expect(at('Consolation|3|1').matchUpStatus).toEqual(WALKOVER);
});

it('the census schedule leaves the draw the same results entered played from the start reach', () => {
  const direct = play([
    ['Main|1|2', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ]);
  const corrected = play([
    ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|1|2', { winningSide: 1 }],
    ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|2', { winningSide: 2 }],
  ]);
  expect(corrected.issues).toEqual([]);
  expect(corrected).toEqual(direct);
});
