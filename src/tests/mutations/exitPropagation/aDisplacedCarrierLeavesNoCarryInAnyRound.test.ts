import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A DISPLACED CARRIER LEAVES NO CARRY IN ANY ROUND (census A1 wave 4, G6; COMPASS 32/31 seed 21079296,
 * `doubleExitPropagateBye` on).
 *
 * A carrier seated beside a BYE goes through it, and their carry is recorded in the seat they landed in and in the
 * matchUp the BYE sent them into. When a correction makes their origin a BYE matchUp, a propagated BYE takes their seat,
 * and `withdrawDisplacedCarry` withdrew the carry only from the furthest matchUp the position had reached: the
 * first-round entry stayed, naming a feeder that is now a BYE, on a BYE-vs-BYE matchUp (`Southeast|1|2`). Every rebuild
 * of the standing results leaves that side with no entry. The carry now goes from every matchUp holding the position.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CLEAR = { matchUpStatus: 'TO_BE_PLAYED', score: { scoreStringSide1: '', scoreStringSide2: '' } };

/** a BYE origin is a may-record fact (exit-propagation.md), so the view leaves it out, as the census round trip does */
const isByeOrigin = (entry: any) =>
  entry?.matchUpStatus === 'BYE' && entry?.previousMatchUpStatus === 'BYE' && !entry?.byeClaims;

function occupant(side: any) {
  if (side.bye) return 'BYE';
  return side.participantId ? 'P' : '-';
}

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
    const provenance = Object.fromEntries(
      Object.entries(matchUp.sideExitProvenance ?? {}).filter(([, entry]) => !isByeOrigin(entry)),
    );
    result[coordinate(matchUp)] = {
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide ?? null,
      sides: matchUp.sides.map(occupant),
      provenance: Object.keys(provenance).length ? named(provenance) : null,
    };
  }
  return result;
}

/** plays the census schedule (a matchUp is scored only once both its participants are there), then the probe and its clear */
function roundTrip(row: any, drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(row.config, drawId, row.policyDefinitions ?? undefined)).toEqual(true);
  const { propagateExitStatus } = row.config;
  for (const step of row.steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    observeMutation({ propagateExitStatus, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
  const before = view(drawId, row.watch);
  const probe = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(row.probe));
  const applied = observeMutation({
    propagateExitStatus,
    matchUpId: probe.matchUpId,
    outcome: row.probe.outcome,
    drawId,
  });
  expect(applied.error).toBeUndefined();
  const forward = view(drawId, row.watch);
  const cleared = observeMutation({ propagateExitStatus, matchUpId: probe.matchUpId, outcome: CLEAR, drawId });
  expect(cleared.error).toBeUndefined();
  return { before, forward, after: view(drawId, row.watch) };
}

const ADISPLACEDCARRIERLEAVESNOCARRYINANYROUND = {
  config: { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21079296 },
  policyDefinitions: null,
  probe: {
    structureName: 'East',
    roundNumber: 1,
    roundPosition: 9,
    outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
  },
  watch: ['Southeast|1|2'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 13, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 6,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 1,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 11,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 7,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 2,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 2, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 16, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 12, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 7,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 15,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    { structureName: 'West', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
  ],
};

it("a BYE that takes a carrier's seat withdraws the carry from every round the seat reached", () => {
  const { before, forward, after } = roundTrip(
    ADISPLACEDCARRIERLEAVESNOCARRYINANYROUND,
    'aDisplacedCarrierLeavesNoCarryInAnyRound',
  );
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['Southeast|1|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'BYE'],
    provenance: {
      '2': {
        byeClaims: ['South|1|4'],
      },
    },
  });
  // what the probe changed there
  expect(forward['Southeast|1|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'BYE'],
    provenance: {
      '2': {
        byeClaims: ['South|1|4'],
      },
    },
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});
