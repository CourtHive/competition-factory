import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A CARRIER PAST A BYE IS RELEASED WHEN ITS EXIT CONVERGES (census A1 wave 5, ERROR_IMPLIES_NO_MUTATION; COMPASS 32/27
 * seed 21155795, `doubleExitPropagateBye` on, shrunk from 30 steps to 10; also COMPASS 32/30 seed 21063079).
 *
 * `West|2|4` held a single carried walkover, awarded to its empty seat, so its carrier went on over the loser link into
 * `Southwest|1|2`, past the BYE there, and into `Southwest|2|1`. `East|1|13`'s double walkover then sent a second
 * carried exit into `West|2|4`, which converged: a double exit has no loser, so the carrier is released from
 * `Southwest|1|2`. Withdrawing the convergence's old single exit left `Southwest|2|1` awarded to the carrier by the
 * default carried in opposite them, which made their position active, and the release's position clear refused it
 * ERR_ACTIVE_DRAW_POSITION — after the draw had moved. Nothing was played anywhere the carrier went: they went on only
 * as a carrier, so the release takes the whole carry back, and the seat is served as a double exit's loser seat is.
 * Every entry order of the standing results leaves the carrier out of `Southwest`.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function occupant(side: any) {
  if (side.bye) return 'BYE';
  return side.participantId ? 'P' : '-';
}

/** status, award, occupants and every provenance entry, with matchUpIds named by coordinate */
function view(drawId: string, watch: string[]) {
  const matchUps = getDrawMatchUps(drawId);
  const coordinates = new Map<string, string>(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  const named = (value: any): any => {
    if (Array.isArray(value)) return value.map(named);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, named(entry)]));
    return typeof value === 'string' && coordinates.has(value) ? coordinates.get(value) : value;
  };
  const result: Record<string, any> = {};
  for (const matchUp of matchUps.filter((candidate: any) => watch.includes(coordinate(candidate)))) {
    result[coordinate(matchUp)] = {
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide ?? null,
      sides: matchUp.sides.map(occupant),
      provenance: matchUp.sideExitProvenance ? named(matchUp.sideExitProvenance) : null,
    };
  }
  return result;
}

/** plays the schedule (a matchUp is scored only once both its participants are there) */
function play(row: any, drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(row.config, drawId)).toEqual(true);
  for (const step of row.steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    const observed = observeMutation({
      propagateExitStatus: row.config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
  }
}

const ACARRIERPASTABYE = {
  config: { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21155795 },
  probe: { structureName: 'East', roundNumber: 1, roundPosition: 13, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 11, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 15,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 2,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 14,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 9, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  ],
};

it('a carrier who went past a BYE only as a carrier is released, carry and all, when their exit converges', () => {
  const drawId = 'aCarrierPastAByeIsReleasedWhenItsExitConverges';
  const row = ACARRIERPASTABYE;
  play(row, drawId);
  const watch = ['West|2|4', 'Southwest|1|2', 'Southwest|2|1'];
  const before = view(drawId, watch);
  // the carrier went over the loser link, past the BYE, and stands in the next round
  expect(before['West|2|4']).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 1, sides: ['-', 'P'] });
  expect(before['Southwest|1|2']).toMatchObject({ matchUpStatus: 'BYE', sides: ['BYE', 'P'] });
  expect(before['Southwest|2|1']).toMatchObject({ sides: ['-', 'P'] });

  const probe = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(row.probe));
  const { propagateExitStatus } = row.config;
  const entered = observeMutation({
    propagateExitStatus,
    matchUpId: probe.matchUpId,
    outcome: row.probe.outcome,
    drawId,
  });
  expect(entered.error).toBeUndefined();
  const after = view(drawId, watch);
  expect(after['West|2|4']).toMatchObject({ matchUpStatus: 'DOUBLE_WALKOVER', winningSide: null, sides: ['P', 'P'] });
  // the loser seat is served as a double exit's: a BYE, claimed by the convergence
  expect(after['Southwest|1|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'BYE'],
    provenance: { '2': { byeClaims: ['West|2|4'] } },
  });
  // and the carrier is nowhere in Southwest: what waits in the final is the exit produced from `Southwest|1|1`
  expect(after['Southwest|2|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['-', 'BYE'],
    provenance: {
      '1': { matchUpStatus: 'WALKOVER', previousMatchUpStatus: 'DOUBLE_WALKOVER', sourceMatchUpId: 'Southwest|1|1' },
    },
  });
});
