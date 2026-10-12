import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * DOUBLE_ELIMINATION CORRECTIONS THAT WERE REFUSED AFTER WRITING THE DRAW (census F2, ERROR_IMPLIES_NO_MUTATION,
 * 2026-10-12).
 *
 * Each case is a census seed shrunk to the steps that reproduce it. On `dev` the last step returned an error
 * (`ERR_OCCUPIED_DRAW_POSITION` or `ERR_EXISTING_POSITION_ASSIGNMENT`) after the draw had already been written, and
 * the draw left behind was inconsistent. Every step here must be accepted and leave a consistent draw.
 *
 * Falsified one fix at a time: reverting any one of the five turns exactly its own case red, with the refusal and an
 * inconsistency (DROPPED_PROGRESSION or WINNING_SIDE_ADVANCEMENT_MISMATCH); the other four stay green.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const RETIREMENT = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
type Step = [string, any];

function play({
  allowChangePropagation,
  participantsCount,
  drawSize,
  policy,
  steps,
  seed,
}: {
  allowChangePropagation?: boolean;
  participantsCount: number;
  drawSize: number;
  steps: Step[];
  policy?: any;
  seed: number;
}) {
  const drawId = `de-${seed}`;
  const config = { drawType: DOUBLE_ELIMINATION, propagateExitStatus: true, participantsCount, drawSize, seed };
  setSubscriptions({});
  expect(prepareDraw(config, drawId, policy)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const result = tournamentEngine.setMatchUpStatus({
      ...(allowChangePropagation ? { allowChangePropagation } : {}),
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.error, coordinates).toBeUndefined();
  }
  expect(getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? []).toEqual([]);
}

/**
 * THE DECIDER HOLDS THE FINAL'S FINALISTS AND NOBODY ELSE (seed 20477784, 8/4, policy off). The decider's two seats
 * are rewritten from the final's winner and loser; a seat left holding a participant from an earlier final refused
 * the next one (`ERR_OCCUPIED_DRAW_POSITION`) after the final had been written.
 */
it('the decider is seated from the final that stands', () => {
  play({
    seed: 20477784,
    participantsCount: 4,
    drawSize: 8,
    policy: POLICY_OFF,
    steps: [
      ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main|2|2', { winningSide: 2 }],
      ['Main|3|1', { winningSide: 1 }],
      ['Backdraw|4|1', { winningSide: 2 }],
      ['Main|4|1', { winningSide: 2 }],
    ],
  });
});

/**
 * AN EXIT ARRIVING OPPOSITE A CARRIER CONVERGES (seed 20460396, 16/14, both the off and policy-off arms). A BYE-advanced
 * position carried onward met an occupant already carrying an exit; it was awarded as a win instead of converging
 * (RULE 4), and the winner was then placed on an occupied seat.
 */
it.each([
  ['default', undefined],
  ['policy off', POLICY_OFF],
])('an exit arriving opposite a carrier converges (%s)', (_label, policy) => {
  play({
    seed: 20460396,
    participantsCount: 14,
    drawSize: 16,
    policy,
    steps: [
      ['Main|1|7', { winningSide: 1 }],
      ['Main|1|6', RETIREMENT],
      ['Main|1|5', { winningSide: 1 }],
      ['Main|2|4', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|2|3', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|4', { winningSide: 1 }],
    ],
  });
});

/**
 * AN AWARD TAKEN BACK IS TAKEN BACK ACROSS ITS OWN WINNER LINK (seed 20506968, 8/6, policy off). Darwin won the
 * Backdraw final by arriving at a produced exit, and the link carried him on. When the exit that produced it was
 * withdrawn, the award was taken back in the Backdraw but not across the link, and the re-derived winner was refused
 * a seat Darwin still held.
 */
it('an award taken back is released across its winner link', () => {
  play({
    seed: 20506968,
    participantsCount: 6,
    drawSize: 8,
    policy: POLICY_OFF,
    steps: [
      ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|3|1', RETIREMENT],
      ['Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main|2|2', { winningSide: 1 }],
    ],
  });
});

/**
 * AN OCCUPANT CARRYING AN EXIT IS READ FROM THE DERIVED SIDE (seed 20522496, 8/7, policy off). Whether the occupant
 * already carries an exit was asked of the side the caller passed rather than the side the advancement derived, so
 * a carrier read as a plain occupant and was advanced into an occupied seat.
 */
it('an occupant carrying an exit is read from the side it occupies', () => {
  play({
    seed: 20522496,
    participantsCount: 7,
    drawSize: 8,
    policy: POLICY_OFF,
    steps: [
      ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|1', { winningSide: 2 }],
    ],
  });
});

/**
 * A CLEAR OF A POSITION NEVER HELD KEEPS THE HELD SIDE'S CARRY (seed 20490105, 16/13, `allowChangePropagation`).
 * Relabelling `Main|1|6` from DOUBLE_DEFAULT to a walkover clears dp 11 through `Backdraw|2|2`, which holds only dp 5.
 * The side of a position the matchUp never held is unknown, and an unknown side was cleared as both: dp 5's carried
 * WALKOVER went with it, the produced exit that then arrived was awarded to its carrier, and the carrier was refused
 * the occupied seat onward.
 */
it('a clear of a position never held keeps the held side carry', () => {
  play({
    seed: 20490105,
    participantsCount: 13,
    drawSize: 16,
    allowChangePropagation: true,
    steps: [
      ['Main|1|2', { winningSide: 1 }],
      ['Main|1|4', { winningSide: 1 }],
      ['Main|1|6', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|1', { winningSide: 2 }],
      ['Main|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ],
  });
});
