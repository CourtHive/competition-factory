import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A DOUBLE EXIT RE-DERIVED TO A SINGLE ONE STOPS PRODUCING AT ONCE — census de 9305625 (DOUBLE_ELIMINATION 8/7),
 * frozen window.
 *
 * `Main|1|2`'s defaulted loser carries the DEFAULTED through the Backdraw's BYEs to `Backdraw|3|1`. `Main|2|1`'s
 * walkover loser converges with `Main|1|4`'s in `Backdraw|2|1`, and that double walkover produces a walkover into
 * `3|1`, where it meets the carried DEFAULTED: `3|1` converges too, and produces a walkover into `4|1`, the Backdraw
 * final, which `Main|3|1`'s loser then takes.
 *
 * Re-scoring `Main|2|1` as a played win by the same winner dissolves the first convergence: `2|1` re-derives to the
 * walkover its carrier still holds, and so does `3|1`, to the DEFAULTED. As a single exit `3|1` produces nothing, but
 * the walkover it had produced into `4|1` was withdrawn only once the mutation had settled (`reconcileStaleExitOrigins`).
 * In between, `2|1`'s winner was directed through `3|1` — taking the DEFAULTED — into `4|1`, won it by the stale
 * walkover, and was sent into a Main final that was full: ERR_EXISTING_POSITION_ASSIGNMENT, after the draw had changed.
 *
 * What a double exit produced goes the moment it re-derives (`applyWithdrawnExits`), by the reconciliation's own test.
 * Entered played from the start, the Backdraw final is the two of them, to be played.
 */

const DRAW_ID = 'rederived-double-exit-stops-producing';
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 7,
  seed: 9305625,
  drawSize: 8,
};

const at = (key: string): any =>
  getDrawMatchUps(DRAW_ID).find(
    (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}` === key,
  );

function play(steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
  }
  const view = (key: string) => {
    const { matchUpStatus, winningSide, sides } = at(key);
    return { key, matchUpStatus, winningSide, participants: (sides ?? []).map((side: any) => side?.participantId) };
  };
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  return { backdraw: ['Backdraw|2|1', 'Backdraw|3|1', 'Backdraw|4|1', 'Main|4|1'].map(view), issues };
}

const BEFORE: [string, any][] = [
  ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

it('re-scored from a walkover to a played win, the stale produced exit goes before the winner is directed', () => {
  const direct = play([...BEFORE, ['Main|2|1', { winningSide: 1 }], ['Main|3|1', { winningSide: 2 }]]);
  const corrected = play([
    ...BEFORE,
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|3|1', { winningSide: 2 }],
    ['Main|2|1', { winningSide: 1 }],
  ]);
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
  // the Backdraw final is Main|3|1's loser against Main|2|1's loser, to be played
  const final = corrected.backdraw.find((matchUp) => matchUp.key === 'Backdraw|4|1');
  expect(final?.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(final?.participants.filter(Boolean)).toHaveLength(2);
});
