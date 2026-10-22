import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A DISSOLVED CONVERGENCE LEAVES THE CLAIM IT SHARED (census A1 wave 4, L1; COMPASS 32/31 seed 21055187 under
 * `doubleExitPropagateBye: false`).
 *
 * A convergence whose loser seat already holds a BYE another double exit claims records its own claim beside it. When
 * the convergence dissolves to a single exit (a carrier taken back), the single exit records no claim on a BYE others
 * hold, as forward play never does (`propagateUnfillableLoserBye` places and claims only an empty seat), so the
 * convergence's claim goes and the BYE stays with the others'. It stood, and the ledger read differently from every
 * rebuild of the standing results.
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

const ADISSOLVEDCONVERGENCELEAVESASHAREDBYECLAIM = {
  config: { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21055187 },
  policyDefinitions: { progression: { doubleExitPropagateBye: false } },
  probe: { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  watch: ['South|1|1', 'West|1|2'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 12, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 1,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 5, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 9, outcome: { winningSide: 1 } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'West', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 12,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 16, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 15,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 9,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 3,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
  ],
};

it('a convergence dissolved to a single exit withdraws its claim on a BYE others hold', () => {
  const { before, forward, after } = roundTrip(
    ADISSOLVEDCONVERGENCELEAVESASHAREDBYECLAIM,
    'aDissolvedConvergenceLeavesASharedByeClaim',
  );
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['South|1|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'BYE'],
    provenance: {
      '2': {
        byeClaims: ['East|1|3'],
      },
    },
  });
  // what the probe changed there
  expect(forward['South|1|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', '-'],
    provenance: {
      '2': {
        matchUpStatus: 'WALKOVER',
        previousMatchUpStatus: 'DOUBLE_WALKOVER',
        sourceMatchUpId: 'West|1|2',
      },
    },
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});
