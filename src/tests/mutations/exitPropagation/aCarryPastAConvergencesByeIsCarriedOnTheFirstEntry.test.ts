import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A CARRY PAST A CONVERGENCE'S BYE IS CARRIED ON THE FIRST ENTRY (census A1 wave 5, IDEMPOTENT_REAPPLY; COMPASS 32/27
 * seed 21138626, `doubleExitPropagateBye` on, shrunk from 30 steps to 3).
 *
 * `East|1|3`'s double walkover sends a second exit into `West|2|1`, where it converges with the walkover already there.
 * The settle produces that convergence (`produceStrandedConvergences`) and serves its loser link: the first carrier
 * leaves `Southwest|1|1` and a BYE takes the seat. The carrier opposite, holding `East|1|8`'s default, now stands past a
 * BYE, and that carry is `reconcileCarriesPastByes`'s to write — which the settle had asked before the BYE existed. So
 * `Southwest|2|1` stayed TO_BE_PLAYED under the carrier until the same double walkover was entered a second time. The
 * carry is now asked again once the settle has produced a convergence.
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

const ACARRYPASTACONVERGENCESBYE = {
  config: { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21138626 },
  probe: { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 8,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
  ],
};

it('a carry past the BYE a convergence places is written when the convergence is entered, not when it is entered again', () => {
  const drawId = 'aCarryPastAConvergencesByeIsCarriedOnTheFirstEntry';
  const row = ACARRYPASTACONVERGENCESBYE;
  play(row, drawId);
  const watch = ['West|2|1', 'Southwest|1|1', 'Southwest|2|1'];
  const probe = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(row.probe));
  const { propagateExitStatus } = row.config;
  const first = observeMutation({
    propagateExitStatus,
    matchUpId: probe.matchUpId,
    outcome: row.probe.outcome,
    drawId,
  });
  expect(first.error).toBeUndefined();
  expect(first.mutated).toEqual(true);
  const entered = view(drawId, watch);
  // the two exits converged; neither carrier lost it
  expect(entered['West|2|1']).toMatchObject({ matchUpStatus: 'DOUBLE_WALKOVER', winningSide: null, sides: ['P', 'P'] });
  // the first carrier left its loser seat for a BYE, and the carrier opposite went past it
  expect(entered['Southwest|1|1']).toMatchObject({ matchUpStatus: 'BYE', sides: ['BYE', 'P'] });
  // carrying their default into the next round, awarded to the seat that waits
  expect(entered['Southwest|2|1']).toEqual({
    matchUpStatus: 'DEFAULTED',
    winningSide: 2,
    sides: ['P', '-'],
    provenance: {
      '1': { matchUpStatus: 'DEFAULTED', previousMatchUpStatus: 'DEFAULTED', sourceMatchUpId: 'West|2|2' },
    },
  });

  // entered a second time, the same outcome has nothing left to do
  const second = observeMutation({
    propagateExitStatus,
    matchUpId: probe.matchUpId,
    outcome: row.probe.outcome,
    drawId,
  });
  expect(second.error).toBeUndefined();
  expect(second.mutated).toEqual(false);
  expect(view(drawId, watch)).toEqual(entered);
});
