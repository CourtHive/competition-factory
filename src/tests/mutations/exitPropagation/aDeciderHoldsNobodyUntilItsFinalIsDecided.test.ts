import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A DECIDER HOLDS NOBODY UNTIL ITS FINAL IS DECIDED (census S8 off arm, DOUBLE_ELIMINATION 8/5, 20722665,
 * ERROR_IMPLIES_NO_MUTATION `ERR_OCCUPIED_DRAW_POSITION`).
 *
 * `Main|1|3` relabelled from a played win to a walkover converges `Backdraw|3|1` (#5455: the award over the carried
 * default is taken back), and the double exit produces through the Backdraw final and the Main final, so `Main|3|1`'s
 * winner takes the Main final and the decider's first seat. Re-scoring `Main|2|1` from a double default to a played win
 * then sends its loser into the Backdraw. Placed there, they are advanced through the exits the convergence had
 * produced, across the Main final (still holding the produced walkover) and into the decider's first seat. The
 * convergence then dissolves and the Main final is left undecided, but nothing took them out of the decider, and the
 * Main final's real result was later refused seating its winner after the draw had been written.
 *
 * The decider's seats are written from its final (`reconcileDecider`): a final with no winner seats nobody.
 */

type Step = [string, any];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 5,
  seed: 20722665,
  drawSize: 8,
};
const schedule: Step[] = [
  ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|3', { winningSide: 2 }],
  ['Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|2|1', { winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|4|1', { winningSide: 2 }],
];

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      drawId,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  return getDrawMatchUps(drawId);
}

const byCoordinate = (matchUps: any[]) =>
  Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );

const deciderSeats = (drawId: string) =>
  getDrawDefinition(drawId)
    .structures.find((structure: any) => structure.structureName === 'Decider')
    .positionAssignments.map((assignment: any) => assignment.participantId);

it('the decider is seated before the correction, and empty once the Main final it came from is undecided', () => {
  play(schedule.slice(0, 4), 'decider-before');
  expect(deciderSeats('decider-before')[0]).toBeDefined();

  const corrected = play(schedule.slice(0, 5), 'decider-corrected');
  const final = corrected.find((matchUp: any) => coordinate(matchUp) === 'Main|4|1');
  expect(final.winningSide).toBeUndefined();
  expect(deciderSeats('decider-corrected')).toEqual([undefined, undefined]);

  // the same results entered directly, each once as it then stands
  const direct = play([schedule[3], schedule[2], schedule[4]], 'decider-direct');
  expect(byCoordinate(corrected)).toEqual(byCoordinate(direct));
});

/**
 * Re-scoring `Main|2|1` as the double default again leaves the standing results the draw held after `Main|1|3`'s walkover,
 * and the draw is the one those results reach entered once each: `Backdraw|3|1` converged, its produced walkover deciding
 * the Main final for `Main|3|1`'s winner, who takes the decider's first seat. The Main final's own result is then not
 * enterable (the census replay skips a matchUp no longer holding two participants). This test used to enter it: the
 * second carrier passing a BYE into `Backdraw|3|1`, at the seat the carried default had been awarded to, took that award
 * instead of converging, and the Main final stood open (census A1 wave 3 G5,
 * `aCarrierArrivingAtTheSeatAnExitAwaitsConverges`).
 */
it('the Main final is then decided by the convergence, as the same results entered once decide it, and the schedule replays clean', () => {
  const corrected = byCoordinate(play(schedule.slice(0, 6), 'decider-full'));
  const direct = byCoordinate(play(schedule.slice(0, 4), 'decider-same-results'));
  expect(corrected['Main|4|1']).toEqual(direct['Main|4|1']);
  expect(corrected['Main|4|1'].matchUpStatus).toEqual(WALKOVER);
  expect(corrected['Backdraw|3|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(corrected).toEqual(direct);
  setSubscriptions({});
  expect(
    replay(
      config,
      schedule.map(([key, outcome]) => {
        const [structureName, roundNumber, roundPosition] = key.split('|');
        return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
      }),
      'decider-replay',
    ),
  ).toBeNull();
});
