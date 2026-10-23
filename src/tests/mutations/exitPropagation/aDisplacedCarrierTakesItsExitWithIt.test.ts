import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * TWO EXITS THAT REACH ONE LOSER SEAT CONVERGE THERE IN EVERY ORDER (census run 18 ORIGIN_ON_UNDECIDED_MATCHUP, OLYMPIC
 * 32/32 under `doubleExitPropagateBye: false`, seed 20711322; the same root closed every policy-off seed of the
 * COMPASS/OLYMPIC 32 group: 20641572, 20685881, 20702368, 20715025, 20726545, 20747058, 20752327).
 *
 * `East|1|9` and `East|1|11` walk over; their losers carry the walkovers into `West|1|5` and `West|1|6`, which decide
 * for the empty seats there, and on as losers into `South|1|3`, where the two carried exits converge. `East|1|10`'s
 * double walkover then converges `West|1|5` too, and a double exit has no loser: its carrier leaves `South|1|3`, taking
 * their walkover with them. Under the policy off the seat they leave shows the walkover `West|1|5`'s convergence
 * produced, never a BYE (CA ruling (A), 2026-10-21), so `South|1|3` is a double walkover of that produced exit and
 * `West|1|6`'s carrier, and its produced walkover waits in `South|2|2`, pending, for the seat a BYE advanced there
 * (a reserved seat is not an opponent in place). Before the ruling the seat took a BYE, and the census found the
 * displaced carrier's walkover still recorded beside it, holding `West|1|6`'s carrier TO_BE_PLAYED in `South|2|2` in
 * this order alone. Entered in every order of the four results the draw is the same.
 */

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 20711322 };
const DRAW_ID = 'displaced-carrier-takes-its-exit';
const DOUBLE_EAST_1_16 = { at: 'East|1|16', outcome: { matchUpStatus: DOUBLE_WALKOVER } };
const WALKOVER_EAST_1_9 = { at: 'East|1|9', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } };
const WALKOVER_EAST_1_11 = { at: 'East|1|11', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } };
const DOUBLE_EAST_1_10 = { at: 'East|1|10', outcome: { matchUpStatus: DOUBLE_WALKOVER } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(schedule: { at: string; outcome: any }[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY_OFF)).toBe(true);
  for (const { at, outcome } of schedule) {
    const target = getDrawMatchUps(DRAW_ID).find((matchUp: any) => coordinate(matchUp) === at);
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId: DRAW_ID,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  const matchUps = getDrawMatchUps(DRAW_ID);
  const names = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  return {
    issueTypes: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
      (issue: any) => issue.issueType,
    ),
    provenance: (key: string) => {
      const matchUp = matchUps.find((candidate: any) => coordinate(candidate) === key);
      return Object.fromEntries(
        Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
          side,
          { ...entry, sourceMatchUpId: names.get(entry?.sourceMatchUpId), byeClaims: undefined },
        ]),
      );
    },
    draw: Object.fromEntries(
      matchUps.map((matchUp: any) => [
        coordinate(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          drawPositions: matchUp.drawPositions,
          participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
        },
      ]),
    ),
  };
}

it('the displaced carrier leaves the produced exit in their seat, which converges, in either order', () => {
  const late = play([DOUBLE_EAST_1_16, WALKOVER_EAST_1_9, WALKOVER_EAST_1_11, DOUBLE_EAST_1_10]);
  expect(late.issueTypes).toEqual([]);

  // the displaced carrier's walkover left with them: the seat shows the walkover West|1|5's convergence produced, and it
  // converges with West|1|6's carrier
  const southOneThree = late.draw['South|1|3'];
  expect(southOneThree.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(southOneThree.participants).toEqual([undefined, late.draw['West|1|6'].participants[0]]);
  expect(late.provenance('South|1|3')[1]).toMatchObject({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    sourceMatchUpId: 'West|1|5',
    matchUpStatus: WALKOVER,
  });
  expect(late.provenance('South|1|3')[2]).toMatchObject({ matchUpStatus: WALKOVER, sourceMatchUpId: 'West|1|6' });

  // its produced walkover waits, pending, opposite the seat a BYE advanced into South|2|2, which nobody has reached
  const southTwoTwo = late.draw['South|2|2'];
  expect(southTwoTwo.matchUpStatus).toEqual(WALKOVER);
  expect(southTwoTwo.winningSide).toBeUndefined();
  expect(southTwoTwo.participants).toEqual([undefined, undefined]);
  expect(late.provenance('South|2|2')[1]).toMatchObject({ matchUpStatus: WALKOVER, sourceMatchUpId: 'South|1|3' });

  const forward = play([DOUBLE_EAST_1_16, DOUBLE_EAST_1_10, WALKOVER_EAST_1_9, WALKOVER_EAST_1_11]);
  expect(forward.issueTypes).toEqual([]);
  expect(late.draw).toEqual(forward.draw);
});
