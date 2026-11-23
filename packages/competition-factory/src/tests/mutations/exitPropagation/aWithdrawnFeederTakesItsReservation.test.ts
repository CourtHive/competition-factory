import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A FIRST_MATCHUP RESERVATION STANDS ONLY ON BOTH FEEDERS' SCORED WINS (census run-17 baseline, F3 MONOTONIC_DECISION;
 * FIRST_MATCH_LOSER_CONSOLATION 16/15 seed 20714203, every arm, shrunk to 5 steps).
 *
 * With `Main|1|5` played and `Main|1|6` RETIRED 6-3, both feeders of `Main|2|3` had scored wins, so whoever loses there
 * cannot enter the consolation and its fed seat, `Consolation|2|3`, was reserved as a BYE. Then `Main|1|5` was cleared
 * and `Main|1|6` corrected to a WALKOVER — an unscored win (CA, 2026-10-13: DEFAULTED/WALKOVER without play is a bye for
 * first-match purposes). Either takes the reservation away, but `Main|2|3` now held one drawPosition, and the
 * reconciliation asked only round-2 matchUps holding two: the BYE stood. Forward play never places it, and the next
 * result on `Main|1|5` took it back as an un-decided BYE (MONOTONIC_DECISION).
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aWithdrawnFeederTakesItsReservation20714203.json');
const { config, steps } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const at = (step: any) => `${step.structureName}|${step.roundNumber}|${step.roundPosition}`;

function play(schedule: any[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const step of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at(step));
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  // read before the next draw is prepared: preparing replaces engine state
  const view = Object.fromEntries(
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
  return { view, matchUps };
}

it('the corrections withdraw the reservation, and the draw is the one forward play leaves', () => {
  expect(config.seed).toEqual(20714203);
  const corrected = play(steps, 'reservation-corrected').view;
  // forward: Main|1|4, then Main|1|6 as the WALKOVER it ends as; Main|1|5 ends cleared, so it was never entered
  const forward = play([steps[3], steps[4]], 'reservation-forward').view;

  expect(corrected['Consolation|2|3'].matchUpStatus).not.toEqual('BYE');
  expect(corrected).toEqual(forward);
});

it('scoring the cleared matchUp afterwards un-decides nothing', () => {
  const { matchUps } = play(steps, 'reservation-monotonic');
  const decided = () =>
    matchUps()
      .filter(
        (matchUp) => matchUp.winningSide || matchUp.matchUpStatus === 'BYE' || matchUp.matchUpStatus === 'WALKOVER',
      )
      .map(coordinate)
      .sort((a: string, b: string) => a.localeCompare(b));
  const before = decided();
  const target = matchUps().find((matchUp) => coordinate(matchUp) === 'Main|1|5');
  const observed = observeMutation({
    propagateExitStatus: true,
    matchUpId: target.matchUpId,
    outcome: { winningSide: 1 },
    drawId: 'reservation-monotonic',
  });
  expect(observed.error).toBeUndefined();
  for (const coordinateBefore of before) expect(decided()).toContain(coordinateBefore);
});
