import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE PRODUCES ONTO THE SEAT AN EXIT AWARDED (census s16 DRAW_INCONSISTENCY STALLED_POSITION,
 * DOUBLE_ELIMINATION 16/11 under `allowChangePropagation`, seed 20605236; the same in the default arm).
 *
 * `Main|3|1`'s walkover carries its loser into `Backdraw|4|2`, decided for the seat `Backdraw|3|2`'s winner will take.
 * `Backdraw|3|2` then becomes a double exit: `Main|1|4`'s carried walkover meets the exit `Backdraw|2|4`'s double
 * walkover produced. Its produced exit is owed to that seat, where it meets the carried walkover (RULE 4), and the
 * Backdraw semi-final's other finalist goes on. It was never sent: the settle produces a stranded convergence onward
 * only into an undecided target, and `Backdraw|4|2` already read as awarded, so the Backdraw final waited on a seat
 * nobody could reach. Entered with the double exit first, `Backdraw|4|2` converges.
 */

type Step = { at: string; outcome: any };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 11,
  drawSize: 16,
  seed: 20605236,
};
const STEPS: Step[] = [
  { at: 'Main|1|2', outcome: { winningSide: 2 } },
  { at: 'Main|1|7', outcome: { winningSide: 1 } },
  { at: 'Main|1|4', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { at: 'Main|2|1', outcome: { winningSide: 2 } },
  { at: 'Main|2|2', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { at: 'Main|3|1', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { at: 'Backdraw|2|1', outcome: { winningSide: 2 } },
  { at: 'Main|2|4', outcome: { winningSide: 1 } },
  { at: 'Backdraw|2|4', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
  { at: 'Main|2|3', outcome: { matchUpStatus: DOUBLE_DEFAULT } },
  { at: 'Main|4|1', outcome: { winningSide: 1 } },
];
const CARRIED_FIRST = STEPS;
const CONVERGENCE_FIRST = [...STEPS.filter((_, index) => index !== 5 && index !== 10), STEPS[5], STEPS[10]];

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === step.at);
    const result: any = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
  }
  const issueTypes = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? []).map(
    (issue: any) => issue.issueType,
  );
  const draw = Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
  return { issueTypes, draw };
}

it.each([false, true])('allowChangePropagation %s: the carried walkover and the produced exit meet', (allow) => {
  if (allow) process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const carriedFirst = play(CARRIED_FIRST, 'converges-onto-awarded-seat');
  expect(carriedFirst.issueTypes).toEqual([]);
  expect(carriedFirst.draw['Backdraw|4|2'].matchUpStatus).toEqual(DOUBLE_WALKOVER);

  const convergenceFirst = play(CONVERGENCE_FIRST, 'converges-onto-awarded-seat-first');
  expect(carriedFirst.draw).toEqual(convergenceFirst.draw);
});
