import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * AN UNDONE AWARD TAKES BACK THE BYE ITS LOSER SEAT WAS GIVEN (census A1 wave 4, R12b; COMPASS under
 * `doubleExitPropagateBye: false`).
 *
 * A produced exit awarded to the participant who arrives opposite it has nobody for a loser, so its loser seat is given
 * a BYE (P39, `propagateUnfillableLoserBye`) and the award claims it. When that participant leaves again, because the
 * result that sent them is cleared, the award goes and the exit stands pending; a pending exit sends nothing over its
 * loser link, so the BYE it claimed goes with the award, as it does where a double exit is unwound. It stood, and the
 * loser seat read BYE in a draw where no rebuild of the standing results places one. Two paths take an award back: the
 * loser direction (`withdrawAwardsToEmptiedSeats`, 32/27 seed 21081040) and the winner direction
 * (`removeSubsequentRoundsParticipant`, 16/14 seed 21086952).
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

const ANUNDONEAWARDTAKESBACKITSLOSERSEATBYE_A = {
  config: { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21081040 },
  policyDefinitions: { progression: { doubleExitPropagateBye: false } },
  probe: { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
  watch: ['Southwest|1|1', 'Southwest|2|1', 'West|2|2'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 13, outcome: { winningSide: 2 } },
    { structureName: 'West', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 13, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 14,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 3,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 9, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 2 } },
    { structureName: 'West', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'West', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 5, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 8,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 5, outcome: { winningSide: 2 } },
    {
      structureName: 'South',
      roundNumber: 2,
      roundPosition: 2,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 14,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 8,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 8, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
  ],
};

it('a loser taken back from the seat opposite a produced exit takes back the BYE the award sent on', () => {
  const { before, forward, after } = roundTrip(
    ANUNDONEAWARDTAKESBACKITSLOSERSEATBYE_A,
    'anUndoneAwardTakesBackItsLoserSeatBye_a',
  );
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['Southwest|1|1']).toEqual({
    matchUpStatus: 'TO_BE_PLAYED',
    winningSide: null,
    sides: ['-', '-'],
    provenance: null,
  });
  // what the probe changed there
  expect(forward['Southwest|1|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['-', 'BYE'],
    provenance: {
      '2': {
        byeClaims: ['West|2|2'],
      },
    },
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});

const ANUNDONEAWARDTAKESBACKITSLOSERSEATBYE_B = {
  config: { participantsCount: 14, propagateExitStatus: false, drawSize: 16, drawType: 'COMPASS', seed: 21086952 },
  policyDefinitions: { progression: { doubleExitPropagateBye: false } },
  probe: { structureName: 'West', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
  watch: ['Southwest|1|1', 'West|2|1'],
  steps: [
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 6,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 2, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 2, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 2, roundPosition: 2, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 6,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 3, roundPosition: 1, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 3, roundPosition: 1, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 3,
      roundPosition: 1,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
  ],
};

it('a winner taken back from the seat opposite a produced exit takes back the BYE the award sent on', () => {
  const { before, forward, after } = roundTrip(
    ANUNDONEAWARDTAKESBACKITSLOSERSEATBYE_B,
    'anUndoneAwardTakesBackItsLoserSeatBye_b',
  );
  // the scheduled draw, as every entry order of its standing results leaves it
  expect(before['Southwest|1|1']).toEqual({
    matchUpStatus: 'TO_BE_PLAYED',
    winningSide: null,
    sides: ['-', '-'],
    provenance: null,
  });
  // what the probe changed there
  expect(forward['Southwest|1|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', '-'],
    provenance: {
      '1': {
        byeClaims: ['West|2|1'],
      },
    },
  });
  // and the clear puts it back
  expect(after).toEqual(before);
});
