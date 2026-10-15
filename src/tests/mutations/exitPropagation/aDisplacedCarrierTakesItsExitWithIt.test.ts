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
 * A CARRIER A PROPAGATED BYE DISPLACES TAKES THEIR EXIT WITH THEM (census run 18 ORIGIN_ON_UNDECIDED_MATCHUP, OLYMPIC
 * 32/32 under `doubleExitPropagateBye: false`, seed 20711322; the same root closed every policy-off seed of the
 * COMPASS/OLYMPIC 32 group: 20641572, 20685881, 20702368, 20715025, 20726545, 20747058, 20752327).
 *
 * `East|1|9` and `East|1|11` walk over; their losers carry the walkovers into `West|1|5` and `West|1|6`, which decide
 * for the empty seats there, and on as losers into `South|1|3`, where the two carried exits converge. `East|1|10`'s
 * double walkover then converges `West|1|5` too: a double exit has no loser, so the BYE it claims takes the seat its
 * carrier held in `South|1|3`. The carrier left, and their carried walkover stayed recorded on that side of the BYE
 * matchUp. Read as one of two carries there, it kept `West|1|6`'s carrier from being carried past the BYE, and
 * `South|2|2` held that carrier TO_BE_PLAYED over the exit they carried in. Entered with `East|1|10` first, `South|2|2`
 * is a walkover awarded to the seat still to be reached.
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

it('the carrier left beside the BYE is carried past it, as with the double walkover entered first', () => {
  const late = play([DOUBLE_EAST_1_16, WALKOVER_EAST_1_9, WALKOVER_EAST_1_11, DOUBLE_EAST_1_10]);
  expect(late.issueTypes).toEqual([]);

  // the displaced carrier's walkover left with them: the BYE's side records no carried exit
  expect(late.draw['South|1|3'].matchUpStatus).toEqual(BYE);
  expect(late.provenance('South|1|3')[1]?.matchUpStatus).toBeUndefined();

  // West|1|6's carrier went on past the BYE carrying their walkover, awarded to the seat nobody has reached
  const southTwoTwo = late.draw['South|2|2'];
  expect(southTwoTwo.matchUpStatus).toEqual(WALKOVER);
  expect(southTwoTwo.winningSide).toEqual(2);
  expect(southTwoTwo.participants[0]).toEqual(late.draw['West|1|6'].participants[0]);
  expect(late.provenance('South|2|2')[1]).toMatchObject({ matchUpStatus: WALKOVER, sourceMatchUpId: 'West|1|6' });

  const forward = play([DOUBLE_EAST_1_16, DOUBLE_EAST_1_10, WALKOVER_EAST_1_9, WALKOVER_EAST_1_11]);
  expect(forward.issueTypes).toEqual([]);
  expect(late.draw).toEqual(forward.draw);
});
