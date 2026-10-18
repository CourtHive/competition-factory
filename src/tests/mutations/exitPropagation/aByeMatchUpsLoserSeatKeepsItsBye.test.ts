import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A BYE MATCHUP'S LOSER SEAT KEEPS ITS BYE (census A1 wave 4, R12a; COMPASS 16/15 seed 21036395 and 32/27 seed
 * 21060039, `doubleExitPropagateBye` on).
 *
 * A BYE matchUp's loser is a BYE, so the ordinary BYE cascade gives its loser seat a BYE that no double exit claims.
 * A double exit whose cascade reached that BYE matchUp recorded a claim on the BYE already standing there, and its
 * unwind then took the BYE away as its own, though the BYE matchUp still held its BYE. Two halves, each pinned: a
 * cascade records no claim on a BYE that stands unclaimed (it predates the cascade), and the unwind keeps a loser-seat
 * BYE while the matchUp feeding it still holds a BYE.
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

const ABYEMATCHUPSLOSERSEATKEEPSITSBYE = {
  config: { participantsCount: 15, propagateExitStatus: false, drawSize: 16, drawType: 'COMPASS', seed: 21036395 },
  policyDefinitions: null,
  probe: { structureName: 'West', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
  watch: ['Southwest|1|1', 'West|2|1'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 6,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 3,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 8,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 8,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 4, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 6,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    { structureName: 'West', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 3, outcome: { winningSide: 1 } },
  ],
};

it("the unwind keeps the BYE a BYE matchUp's loser seat holds", () => {
  const { before, forward, after } = roundTrip(ABYEMATCHUPSLOSERSEATKEEPSITSBYE, 'aByeMatchUpsLoserSeatKeepsItsBye');
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['Southwest|1|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', '-'],
    provenance: null,
  });
  // what the probe changed there
  expect(forward['Southwest|1|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', '-'],
    provenance: null,
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});

const ABYEMATCHUPSLOSERSEATKEEPSITSBYE_18 = {
  config: { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21060039 },
  policyDefinitions: null,
  probe: {
    structureName: 'East',
    roundNumber: 1,
    roundPosition: 9,
    outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
  },
  watch: ['Southwest|1|2', 'Southwest|2|1'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 3,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 8, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 11,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 15,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 4,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 11, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 11, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 2,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
  ],
};

it('a cascade records no claim on a BYE that stands unclaimed', () => {
  const { before, forward, after } = roundTrip(
    ABYEMATCHUPSLOSERSEATKEEPSITSBYE_18,
    'aByeMatchUpsLoserSeatKeepsItsBye_18',
  );
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['Southwest|1|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'P'],
    provenance: {
      '2': {
        matchUpStatus: 'WALKOVER',
        previousMatchUpStatus: 'WALKOVER',
        sourceMatchUpId: 'West|2|4',
      },
    },
  });
  // what the probe changed there
  expect(forward['Southwest|1|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'P'],
    provenance: {
      '2': {
        matchUpStatus: 'WALKOVER',
        previousMatchUpStatus: 'WALKOVER',
        sourceMatchUpId: 'West|2|4',
      },
    },
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});
