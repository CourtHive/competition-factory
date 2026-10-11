import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION, COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * AN EXIT CARRIED ON FROM A CONVERGENCE CARRIES NO STALE WINNING SIDE.
 *
 * The tenth at-scale run's three stalls, all under `doubleExitPropagateBye: false` and all pre-existing (identical on
 * v7.9.0). A double exit produces an exit over its LOSER link (the policy-off form; with the policy on it places a BYE).
 * Where that exit meets one already standing, the target converges, and `advanceFromTarget` recursed into
 * `doubleExitAdvancement` to carry the converged exit on. It passed its params on whole — including the
 * `walkoverWinningSide` derived for the matchUp the exit ARRIVED in, which names a different seat in the next one.
 * `advanceConvergedWinner` already drops it for exactly that reason; this recursion did not.
 *
 * Carried on, the stale side was written as the onward matchUp's winner: census 20349817 (COMPASS 16/11) left
 * `North|2|1` a WALKOVER won by side 2, the side its exit came in on; the participant who then arrived on side 1 was
 * never awarded it, and the North final waited forever. The DOUBLE_ELIMINATION and FIRST_MATCH_LOSER_CONSOLATION seeds
 * are the same shape in a Backdraw and a consolation. Each seat now goes to the side without the exit (RULE 2).
 * Falsified before the change: all three stalled.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const CASES = [
  {
    label: 'DOUBLE_ELIMINATION 8/8 (census 20346401): Backdraw|3|1 goes to Cordelia Humperdinck',
    config: {
      drawType: DOUBLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 8,
      seed: 20346401,
      propagateExitStatus: true,
    },
    seat: 'Backdraw|3|1',
    winner: 'Cordelia Humperdinck',
    steps: [
      ['Main|1|2', { winningSide: 1 }],
      ['Main|1|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|3|1', { winningSide: 2 }],
      ['Backdraw|4|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ] as [string, any][],
  },
  {
    label: 'COMPASS 16/11 (census 20349817): North|2|1 goes to Ola Rumfoord',
    config: { drawType: COMPASS, drawSize: 16, participantsCount: 11, seed: 20349817, propagateExitStatus: true },
    seat: 'North|2|1',
    winner: 'Ola Rumfoord',
    steps: [
      ['East|2|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['East|2|1', { winningSide: 2 }],
      ['East|2|3', { matchUpStatus: DOUBLE_WALKOVER }],
      ['East|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
      ['East|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ] as [string, any][],
  },
  {
    label: 'FIRST_MATCH_LOSER_CONSOLATION 16/13 (census 20352232): Consolation|4|1 goes to Winston Drazic',
    config: {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 16,
      participantsCount: 13,
      seed: 20352232,
      propagateExitStatus: true,
    },
    seat: 'Consolation|4|1',
    winner: 'Winston Drazic',
    steps: [
      ['Main|1|4', { winningSide: 2 }],
      ['Main|2|2', { winningSide: 1 }],
      ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|3|2', { winningSide: 2 }],
    ] as [string, any][],
  },
];

it.each(CASES)('$label', ({ config, steps, seat, winner }) => {
  const drawId = `stale-side-${config.seed}`;
  setSubscriptions({});
  expect(prepareDraw(config, drawId, policyDefinitions)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    tournamentEngine.setMatchUpStatus({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
  }

  const matchUps = getDrawMatchUps(drawId);
  const stalledSeat = matchUps.find((matchUp: any) => key(matchUp) === seat);
  expect(stalledSeat.matchUpStatus).toEqual(WALKOVER);
  const winningSide = stalledSeat.sides.find((side: any) => side.sideNumber === stalledSeat.winningSide);
  expect(winningSide?.participant?.participantName).toEqual(winner);
  // the exit is on the OTHER side: the side without it won (RULE 2). An arrival entry records how the winner got
  // here and carries no exit status.
  expect(stalledSeat.sideExitProvenance?.[stalledSeat.winningSide]?.matchUpStatus).toBeUndefined();
  expect(stalledSeat.sideExitProvenance?.[3 - stalledSeat.winningSide]?.matchUpStatus).toEqual(WALKOVER);

  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  const stalls = (integrity.inconsistencies ?? []).filter((issue: any) => issue.issueType === STALLED_POSITION);
  expect(stalls).toEqual([]);
});
