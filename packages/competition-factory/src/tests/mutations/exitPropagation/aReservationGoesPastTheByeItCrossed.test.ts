import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A RESERVATION GOES WITH THE EXIT THAT MADE IT, PAST THE BYE IT CROSSED.
 *
 * The eighth at-scale run (seed 20278127, FIRST_MATCH_LOSER_CONSOLATION 16/16, `doubleExitPropagateBye: false`), shrunk
 * to twelve steps. `Main|1|4`'s double default produces a DEFAULTED into `Consolation|1|2`, whose other seat — dp 7,
 * `Main|1|3`'s loser, not yet decided — wins it empty (RULE 2) and is advanced as a RESERVATION: through the BYE on
 * `2|2` into `3|1`, where a produced walkover from `Main|2|1` already waits for whoever arrives.
 *
 * Then `Main|1|3` is a double walkover: nobody falls to dp 7, and under the policy the seat receives a produced WALKOVER
 * instead of a BYE. `Consolation|1|2` converges, its RULE 2 award is void, and the reservation it had advanced must come
 * back. `releaseAdvancedDrawPosition` took it out of `2|2` and stopped at `3|1`: scope 2 ("only an undecided matchUp
 * releases a slot") read the pending walkover there — an exit status with no winner — as a recorded result. The
 * reservation stayed, `1|2`'s converged walkover arrived opposite it and could not converge with the one already
 * standing, and `4|1`'s Constantine waited on a matchUp that would never produce: STALLED_POSITION.
 *
 * A pending exit is undecided — "a produced exit has no winningSide until a participant arrives" (CA, 2026-09-20) — and
 * while an exit is being withdrawn a reservation in it is released like any position an undecided matchUp holds. The
 * exit itself stands, for whoever arrives. Falsified before the change: `3|1` WALKOVER with dp 7 alone, `4|1` TO_BE_PLAYED
 * with Constantine alone, one stall.
 */
const STEPS: [string, any][] = [
  ['Main|1|5', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|6', { winningSide: 2 }],
  ['Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|1', { winningSide: 1 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Consolation|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|8', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Consolation|3|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|3|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it('a reservation goes with the exit that made it, past the BYE it crossed', () => {
  const drawId = 'reservation-past-the-bye';
  setSubscriptions({});
  const config = {
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    propagateExitStatus: false,
    participantsCount: 16,
    seed: 20278127,
    drawSize: 16,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, drawId, policyDefinitions)).toEqual(true);

  for (const [coordinates, outcome] of STEPS) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    tournamentEngine.setMatchUpStatus({ propagateExitStatus: false, matchUpId: target.matchUpId, outcome, drawId });
  }

  const matchUps = getDrawMatchUps(drawId);
  const at = (coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);

  // the reservation left every round it had been advanced through
  expect(at('Consolation|2|2').drawPositions ?? []).not.toContain(7);
  const meeting = at('Consolation|3|1');
  expect(meeting.drawPositions ?? []).not.toContain(7);
  // and the two produced walkovers that meet there converge and produce onward
  expect(meeting.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  const next = at('Consolation|4|1');
  expect(next.matchUpStatus).toEqual(WALKOVER);
  expect(next.sides.find((side: any) => side.sideNumber === next.winningSide).participant.participantName).toEqual(
    'Constantine Ahern',
  );

  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  const stalls = (integrity.inconsistencies ?? []).filter((issue: any) => issue.issueType === STALLED_POSITION);
  expect(
    stalls.map((issue: any) => key(matchUps.find((matchUp: any) => matchUp.matchUpId === issue.matchUpId))),
  ).toEqual([]);
  expect(integrity.valid).toEqual(true);
});
