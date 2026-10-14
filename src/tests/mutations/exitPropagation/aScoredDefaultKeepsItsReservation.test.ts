import { stallsAfterSchedule } from '@Tests/testHarness/exitPropagation/stallCount';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * DEFAULTED AND DEFAULTED 6-3 ARE DIFFERENT RESULTS, AND THE UNWIND KNOWS IT (CA, 2026-10-13; FIRST_MATCH_LOSER_CONSOLATION,
 * following USTA Reg. II.B.5.a: a first-round win by default is a bye for first-match purposes).
 *
 * *"For FMLC we follow the USTA Rule and we differentiate DEFAULTED from DEFAULTED 6-3... the forward logic treats them
 * differently, so the unwind logic must as well."* Forward play asks `isUnscoredOutcome`: a scored DEFAULTED is a played
 * win, so when both first-round feeders of a round-2 matchUp hold one, nobody who loses there can enter the
 * consolation, and the fed seat is reserved as a BYE at once. Withdrawing that round-2 result asked a status list, read
 * the scored DEFAULTED as a bye, and took the reservation back; nothing restored it.
 *
 * Census run-17 baseline, FMLC 8/8 seed 20754793 (every arm; 8/7 seed 20664895 is the same shape), shrunk to 7 steps:
 * `Main|1|3` RETIRED 6-3 corrected to DEFAULTED (the score stays: a DEFAULTED 6-3), `Main|2|2` played then re-entered
 * as a DOUBLE_DEFAULT. `Consolation|2|2` lost its BYE and its participant waited on nobody.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aScoredDefaultKeepsItsReservation20754793.json');
const { config, steps } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const at = (step: any) => `${step.structureName}|${step.roundNumber}|${step.roundPosition}`;
const scored = { matchUpStatus: 'DEFAULTED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

function play(schedule: any[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const step of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }
  // read before the next draw is prepared: preparing replaces engine state
  return Object.fromEntries(
    matchUps().map((matchUp) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: matchUp.drawPositions,
        participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
}

// the same results entered once, in order; Main|1|3 entered directly as the scored default the correction left
const forward = () =>
  steps
    .filter((step: any, index: number) => !steps.slice(index + 1).some((later: any) => at(later) === at(step)))
    .map((step: any) => (at(step) === 'Main|1|3' ? { ...step, outcome: scored } : step));

it('a scored DEFAULTED keeps its reservation BYE when the round-2 result is withdrawn', () => {
  expect(config.seed).toEqual(20754793);
  const corrected = play(steps, 'scored-default-corrected');
  const direct = play(forward(), 'scored-default-forward');

  expect(corrected['Consolation|2|2']).toMatchObject({ matchUpStatus: 'BYE' });
  expect(corrected).toEqual(direct);
});

it('the corrected schedule strands nobody', () => {
  expect(
    stallsAfterSchedule({ scenario: { seed: config.seed, config, steps }, drawId: 'scored-default-stalls' } as any),
  ).toEqual([]);
});

it('a bare DEFAULTED still unwinds as a bye, and ends where forward play ends', () => {
  // Main|1|3 entered as a bare DEFAULTED (no RETIRED, no score): its winner did not play their first match
  const bare = steps.filter((step: any) => !(at(step) === 'Main|1|3' && step.outcome.matchUpStatus === 'RETIRED'));
  const corrected = play(bare, 'bare-default-corrected');
  const direct = play(
    bare.filter((step: any, index: number) => !bare.slice(index + 1).some((later: any) => at(later) === at(step))),
    'bare-default-forward',
  );
  expect(corrected).toEqual(direct);
});
