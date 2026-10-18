import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A CARRY PAST A BYE MEETS A PENDING EXIT IN THE MATCHUP BEYOND (census A1 wave 4, G5r; COMPASS 32/29 seed 21129718,
 * `doubleExitPropagateBye` on).
 *
 * A convergence's produced exit is carried past the BYE in its next matchUp into the one after. When that matchUp already
 * holds a pending exit on its other side and nobody has reached it, the two exits meet there and it converges, as it does
 * when the pending exit arrives second. `advanceFromStandingExit` instead advanced from the standing exit as though it
 * were the double exit, recording nothing: re-forming `South|1|2`'s convergence on a clear left `South|3|1` a WALKOVER
 * where every entry order leaves a DOUBLE_WALKOVER.
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

const ACARRYPASTABYEMEETSAPENDINGEXIT = {
  config: { participantsCount: 29, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21129718 },
  policyDefinitions: null,
  probe: { structureName: 'East', roundNumber: 1, roundPosition: 5, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  watch: ['South|2|1', 'South|3|1'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 13, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 3,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
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
      roundPosition: 4,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 11, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 8,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 9, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    { structureName: 'West', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'West', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
  ],
};

it("a re-formed convergence's exit carried past a BYE converges with the pending exit beyond", () => {
  const { before, forward, after } = roundTrip(ACARRYPASTABYEMEETSAPENDINGEXIT, 'aCarryPastAByeMeetsAPendingExit');
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['South|3|1']).toEqual({
    matchUpStatus: 'DOUBLE_WALKOVER',
    winningSide: null,
    sides: ['-', '-'],
    provenance: {
      '1': {
        matchUpStatus: 'WALKOVER',
        previousMatchUpStatus: 'DOUBLE_WALKOVER',
        sourceMatchUpId: 'South|1|2',
      },
      '2': {
        matchUpStatus: 'WALKOVER',
        previousMatchUpStatus: 'DOUBLE_WALKOVER',
        sourceMatchUpId: 'South|2|2',
      },
    },
  });
  // what the probe changed there
  expect(forward['South|3|1']).toEqual({
    matchUpStatus: 'DOUBLE_WALKOVER',
    winningSide: null,
    sides: ['P', '-'],
    provenance: {
      '1': {
        matchUpStatus: 'DEFAULTED',
        previousMatchUpStatus: 'DEFAULTED',
        sourceMatchUpId: 'West|1|4',
      },
      '2': {
        matchUpStatus: 'WALKOVER',
        previousMatchUpStatus: 'DOUBLE_WALKOVER',
        sourceMatchUpId: 'South|2|2',
      },
    },
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});
