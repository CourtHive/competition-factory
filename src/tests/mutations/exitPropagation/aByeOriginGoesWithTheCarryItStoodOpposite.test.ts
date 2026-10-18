import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A BYE ORIGIN GOES WITH THE CARRY IT STOOD OPPOSITE (census A1 wave 5, ARRIVAL_TRUE; COMPASS 32/30 seed 21063079,
 * `doubleExitPropagateBye` on, shrunk to 6 steps).
 *
 * `East|1|10`'s loser carried their default through `West|1|5` into `South`, past the BYEs there, and `South|2|2`
 * recorded the carry on side 1 with the BYE origin `{ BYE }` opposite it, from `South|1|4`. `East|1|9`'s double
 * walkover then gave `West|1|5` a BYE, so the carrier went on in `West` instead, and a propagated BYE took their
 * `South` seat. `withdrawDisplacedCarry` withdrew the carry and left the BYE origin standing opposite no exit, which
 * the BYE origin rule (exit-propagation.md, census F5) does not allow. It now goes with the carry, as
 * `removeDoubleExit`'s `retainByeOriginsBesideExits` already does; every entry order leaves `South|2|2` with nothing.
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

const ABYEORIGINGOESWITHTHECARRY = {
  config: { participantsCount: 30, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21063079 },
  steps: [
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 14,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 11,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 12, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 9, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  ],
};

it('a BYE origin is withdrawn with the carry opposite it when a BYE displaces the carrier', () => {
  const drawId = 'aByeOriginGoesWithTheCarryItStoodOpposite';
  const row = ABYEORIGINGOESWITHTHECARRY;
  play({ ...row, steps: row.steps.slice(0, -1) }, drawId);
  const watch = ['South|2|2'];
  // the carry, and the BYE origin written opposite it
  expect(view(drawId, watch)['South|2|2']).toMatchObject({
    matchUpStatus: 'BYE',
    provenance: {
      '1': { matchUpStatus: 'DEFAULTED', sourceMatchUpId: 'West|1|5' },
      '2': { matchUpStatus: 'BYE', previousMatchUpStatus: 'BYE', sourceMatchUpId: 'South|1|4' },
    },
  });

  const last = row.steps[row.steps.length - 1];
  const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(last));
  const { propagateExitStatus } = row.config;
  const entered = observeMutation({ propagateExitStatus, matchUpId: target.matchUpId, outcome: last.outcome, drawId });
  expect(entered.error).toBeUndefined();
  // the carrier is displaced by a BYE, and neither the carry nor the origin opposite it stays
  expect(view(drawId, watch)['South|2|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'BYE'],
    provenance: null,
  });
});
