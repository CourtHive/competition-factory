import { byeFedLoserSeats, checkArrivalsTrue } from '@Tests/testHarness/exitPropagation/properties';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import {
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { isDoubleExit } from '@Validators/isExit';

/**
 * A CLAIM ON A BYE-MATCHUP-FED LOSER SEAT IS LEFT OUT OF THE ROUND TRIP, AND POLICED (CA ruling (b), 2026-10-20).
 *
 * The BYE in the loser seat of a BYE matchUp has two possible reasons: the feeder is a BYE matchUp, and a double exit
 * whose produced exit the feeder relays makes the feeder's loser nobody. The claim ledger records who claims a BYE, not
 * why it was placed, so whether the seat's BYE carries the double exit's claim depends on which reason came first, and
 * two fixes depend on each outcome: `aClearedSeatKeepsTheByeALiveDoubleExitClaims` (#5576) needs the claim where the
 * double exit's BYE came first, and `aByeMatchUpsLoserSeatKeepsItsBye` (A1 wave 4) needs its absence where the
 * feeder's structural BYE came first. Census Phase B (COMPASS 32/30 policy-off, seed 30004303) found the round trip
 * landing on the other variant: forward play leaves `West|1|3`'s claim on `Southeast|1|1` in two of five entry orders.
 *
 * Both state rules were measured and reverted on 2026-10-20: never claiming reopened #5576 (a cleared seat lost its
 * BYE); always claiming reopened wave 4 (an unwind took the BYE a BYE matchUp still justifies). So the round trip
 * leaves these claims out, as it leaves out arrival entries (F4) and BYE origins (F5), and `checkArrivalsTrue`
 * requires a claim present there to name the feeder itself or a matchUp that is still a double exit. The lasting fix
 * is a ledger that records why each BYE was placed (Mentat DESIGN_FLAWS_PUNCH_LIST).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 30004303 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const CENSUS_SCHEDULE = [
  at('East|1|5', clearOutcome),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|5', { winningSide: 1 }),
  at('East|1|14', { winningSide: 2 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|2|1', { winningSide: 2 }),
  at('East|2|1', { winningSide: 1 }),
  at('East|1|14', { winningSide: 2 }),
  at('East|1|11', { winningSide: 1 }),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|7', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|9', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|2', { winningSide: 2 }),
  at('East|1|11', { winningSide: 1 }),
  at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', { winningSide: 1 }),
  at('East|1|7', clearOutcome),
  at('East|1|10', clearOutcome),
  at('East|1|6', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|15', { winningSide: 2 }),
  at('East|2|1', { winningSide: 2 }),
  at('East|2|1', { winningSide: 2 }),
  at('East|1|11', { winningSide: 2 }),
  at('East|2|1', { winningSide: 1 }),
  at('East|2|5', { winningSide: 1 }),
  at('East|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
];

it('the census schedule and its probes leave the draw they found', () => {
  setSubscriptions({});
  expect(replay(CONFIG, CENSUS_SCHEDULE, 'bye-fed-claim-census', POLICY_OFF)).toMatchObject({
    verdict: 'clean',
    complete: true,
  });
});

/** the scheduled draw, a BYE-fed loser seat in it, and a played matchUp and a double exit to name as claimants */
function scheduledDraw(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of CENSUS_SCHEDULE) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
  const seats = byeFedLoserSeats(getDrawDefinition(drawId));
  expect(seats.size).toBeGreaterThan(0);
  const [seat, feeder] = [...seats.entries()][0];
  const [matchUpId, side] = seat.split('|');
  const matchUps = getDrawMatchUps(drawId);
  const played = matchUps.find((matchUp: any) => matchUp.winningSide && !isDoubleExit(matchUp.matchUpStatus));
  const doubleExit = matchUps.find((matchUp: any) => isDoubleExit(matchUp.matchUpStatus));
  expect(played && doubleExit).toBeTruthy();
  return { matchUpId, side: Number(side), feeder, played, doubleExit };
}

/** record a claim on the seat in the stored record, as a cascade would */
function plantClaim(drawId: string, matchUpId: string, side: number, claimantMatchUpId: string) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const stored = tournamentRecord.events[0].drawDefinitions[0].structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);
  stored.sideExitProvenance = {
    ...stored.sideExitProvenance,
    [side]: { ...stored.sideExitProvenance?.[side], byeClaims: [claimantMatchUpId] },
  };
  tournamentEngine.setState(tournamentRecord);
  expect(getDrawMatchUps(drawId).length).toBeGreaterThan(0);
}

it('a claim there naming a matchUp that is no double exit is false', () => {
  const drawId = 'bye-fed-claim-false';
  const { matchUpId, side, played } = scheduledDraw(drawId);
  expect(checkArrivalsTrue(drawId)).toEqual([]);
  plantClaim(drawId, matchUpId, side, played.matchUpId);
  const failures = checkArrivalsTrue(drawId);
  expect(failures.map((failure) => failure.property)).toEqual(['ARRIVAL_TRUE']);
  expect(failures[0].detail).toContain('a BYE claim on a BYE-matchUp-fed seat names');
  expect(failures[0].detail).toContain(played.matchUpStatus);
});

it('a claim there naming a live double exit, or the feeder itself, is true', () => {
  const drawId = 'bye-fed-claim-true';
  const { matchUpId, side, feeder, doubleExit } = scheduledDraw(drawId);
  plantClaim(drawId, matchUpId, side, doubleExit.matchUpId);
  expect(checkArrivalsTrue(drawId)).toEqual([]);
  plantClaim(drawId, matchUpId, side, feeder);
  expect(checkArrivalsTrue(drawId)).toEqual([]);
});
