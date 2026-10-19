import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * A CARRIER WHO WENT ON ONLY AS A CARRIER IS RELEASED WITH THE CARRY, WHOEVER CARRIED THE EXIT OPPOSITE THEM (census A1
 * wave 5, fix B; COMPASS 32/27 seed 21155795, the schedule of `aCarrierPastAByeIsReleasedWhenItsExitConverges` with the
 * other half of `Southwest` re-entered).
 *
 * `East|1|15`'s walkover sends its loser past `West|1|8`'s BYE into `West|2|4`, which their carried exit decides for the
 * empty seat (RULE 2). They go on as its loser into `Southwest|1|2`, past the BYE that `West|2|3` sends there, and into
 * `Southwest|2|1`, carrying the walkover. In the existing pin the exit opposite them there is the one a double walkover
 * in `Southwest|1|1` produced. Here it is another participant's OWN carry: `East|1|2`'s walkover goes past `West|1|1`'s
 * BYE, loses `West|2|1` to it, and goes past the BYE that `West|2|2` sends into `Southwest|1|1`. The two carries converge
 * in `Southwest|2|1`.
 *
 * `East|1|13`'s double walkover then converges at `West|2|4`, and the first carrier is taken back out of `Southwest`.
 * Withdrawing `West|2|4`'s single exit leaves `Southwest|2|1` awarded to the first carrier by the walkover carried in
 * opposite them, so their position is active and the position clear would refuse it. Nothing was played anywhere they
 * went, so the release takes the carry with them (`carriedOnByExitsOnly`). The draw is the one the double walkover
 * entered first leaves.
 *
 * What this does NOT pin, because no entry reaches it: a carrier who went on from the seat and then played, or a seat
 * or onward matchUp with a score or a direct exit. The release is reached only where the converging exit met a CARRIED
 * one (`convergesAtTarget`), so the first carrier always carries. A carried exit decides every matchUp its carrier
 * stands in, even with nobody opposite yet, and it is changed only at its origin (`CANNOT_CHANGE_OUTCOME`). So a carrier
 * goes on only past BYEs, and every onward matchUp is a BYE, waiting on the carry, or decided by it.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function occupant(side: any) {
  if (side.bye) return 'BYE';
  return side.participantId ?? '-';
}

/** every matchUp of the draw by coordinate: status, award, occupants and provenance, matchUpIds named by coordinate */
function view(drawId: string) {
  const matchUps = getDrawMatchUps(drawId);
  const coordinates = new Map<string, string>(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  const named = (value: any): any => {
    if (Array.isArray(value)) return value.map(named);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, named(entry)]));
    return typeof value === 'string' && coordinates.has(value) ? coordinates.get(value) : value;
  };
  return Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide ?? null,
        sides: matchUp.sides.map(occupant),
        score: matchUp.score?.scoreStringSide1 || null,
        provenance: matchUp.sideExitProvenance ? named(matchUp.sideExitProvenance) : null,
      },
    ]),
  );
}

const CONFIG = { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21155795 };
const CONVERGENCE = { at: 'East|1|13', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } };

function enter(drawId: string, { at, outcome }: { at: string; outcome: any }) {
  const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === at);
  return observeMutation({
    propagateExitStatus: CONFIG.propagateExitStatus,
    matchUpId: target.matchUpId,
    outcome,
    drawId,
  });
}

function play(schedule: { at: string; outcome: any }[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of schedule) {
    const observed = enter(drawId, step);
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
}

const SCHEDULE = [
  // `West|2|3` becomes a BYE, which stands in front of the first carrier in `Southwest|1|2`
  { at: 'East|1|11', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'East|1|9', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'East|1|10', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  // the first carrier, and the default carried into `West|1|7` that the double walkover will meet
  { at: 'East|1|15', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'East|1|14', outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 } },
  // `West|2|2` becomes a BYE, which stands in front of the second carrier in `Southwest|1|1`
  { at: 'East|1|6', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'East|1|8', outcome: { winningSide: 1 } },
  // the second carrier, whose carry `West|1|2`'s winner wins in `West|2|1`
  { at: 'East|1|2', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'East|1|3', outcome: { winningSide: 1 } },
  { at: 'East|1|4', outcome: { winningSide: 2 } },
  { at: 'West|1|2', outcome: { winningSide: 1 } },
];

it('a carrier past a BYE is released, carry and all, where another carry decided the matchUp opposite them', () => {
  const drawId = 'aCarrierWhoWentOnOnlyAsACarrierIsReleasedWithTheCarry';
  play(SCHEDULE, drawId);
  const before = view(drawId);
  const carrier = before['West|2|4'].sides[1];
  const other = before['Southwest|1|1'].sides[0];
  // each carrier went past a BYE, and the two carries converged in the Southwest final; nothing has a score
  expect(before['West|2|4']).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 1, sides: ['-', carrier] });
  expect(before['West|2|1']).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 2, score: null });
  expect(before['West|2|1'].sides[0]).toEqual(other);
  expect(before['Southwest|1|1']).toMatchObject({ matchUpStatus: 'BYE', winningSide: null, sides: [other, 'BYE'] });
  expect(before['Southwest|1|2']).toMatchObject({ matchUpStatus: 'BYE', winningSide: null, sides: ['BYE', carrier] });
  expect(before['Southwest|2|1']).toEqual({
    matchUpStatus: 'DOUBLE_WALKOVER',
    winningSide: null,
    sides: [other, carrier],
    score: null,
    provenance: {
      '1': { matchUpStatus: 'WALKOVER', previousMatchUpStatus: 'WALKOVER', sourceMatchUpId: 'West|2|1' },
      '2': { matchUpStatus: 'WALKOVER', previousMatchUpStatus: 'WALKOVER', sourceMatchUpId: 'West|2|4' },
    },
  });

  const converged = enter(drawId, CONVERGENCE);
  expect(converged.error).toBeUndefined();
  expect(converged.thrown).toBeUndefined();
  const after = view(drawId);
  expect(after['West|2|4']).toMatchObject({ matchUpStatus: 'DOUBLE_WALKOVER', winningSide: null });
  expect(after['West|2|4'].sides[1]).toEqual(carrier);
  // the first carrier's seat is served as a double exit's loser seat
  expect(after['Southwest|1|2']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: ['BYE', 'BYE'],
    score: null,
    provenance: { '2': { byeClaims: ['West|2|4'] } },
  });
  // and the final holds the second carrier beside the BYE it sends, their own carry recorded beside it
  expect(after['Southwest|2|1']).toEqual({
    matchUpStatus: 'BYE',
    winningSide: null,
    sides: [other, 'BYE'],
    score: null,
    provenance: { '1': { matchUpStatus: 'WALKOVER', previousMatchUpStatus: 'WALKOVER', sourceMatchUpId: 'West|2|1' } },
  });
  expect(Object.values(after).some((matchUp: any) => matchUp.sides.includes(carrier) && matchUp.score)).toEqual(false);
  // the second carrier's path is untouched
  for (const at of ['West|2|1', 'Southwest|1|1']) expect(after[at]).toEqual(before[at]);

  // the same results with the double walkover entered first
  play([CONVERGENCE, ...SCHEDULE], `${drawId}-convergenceFirst`);
  expect(after).toEqual(view(`${drawId}-convergenceFirst`));
});
