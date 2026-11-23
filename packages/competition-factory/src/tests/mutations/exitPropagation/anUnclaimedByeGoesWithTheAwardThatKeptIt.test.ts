import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { checkLoserSeatsDerived } from '@Tests/testHarness/exitPropagation/properties';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { describe, expect, it } from 'vitest';

/**
 * AN UNCLAIMED BYE GOES WITH THE AWARD THAT KEPT IT (census P58 step 3b, openings: COMPASS 16/13 seeds 21048963 and
 * 21091001 policy off, 21064207 and 21092581 with `allowChangePropagation`; `LOSER_SEAT_DERIVED`).
 *
 * `West|1|1` is a BYE matchUp while `East|1|2`'s double walkover leaves `West` dp 2 a BYE, so its loser link gives
 * `West|2|1`'s loser seat, `Southwest|1|1` dp 1, a BYE. `East|1|3` and `East|1|4` decided by exits converge `West|1|2`
 * into a double exit, which produces a walkover at `West|2|1`. Re-scoring `East|1|2` sends its loser to `West` dp 2:
 * `West|1|1` is a BYE matchUp no longer, `West|2|1` is awarded over the produced walkover, and its loser is still
 * nobody, so the seat's BYE is KEPT (`byeSeatStands`), never cleared and placed again, and records no `byeClaims`.
 * Re-scoring `East|1|4` as played dissolves `West|1|2`, the award is taken back and `West|2|1` will be played: its loser
 * reaches `Southwest|1|1` dp 1. The withdrawal found the seats to release in the claim ledger only, missed the unclaimed
 * BYE and left it standing opposite the loser who will arrive. The seats are read from the draw
 * (`byeSeatPositionsOwedTo`), as the step that retires the ledger reads them.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED = { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

const config = { participantsCount: 13, propagateExitStatus: true, drawSize: 16, drawType: 'COMPASS', seed: 21048963 };
const steps = [
  { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 } },
  { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: RETIRED },
];
const dissolve = { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } };

function seat(drawId: string, structureName: string, drawPosition: number) {
  const structure = getDrawDefinition(drawId).structures.find(
    (candidate: any) => candidate.structureName === structureName,
  );
  const assignment = structure.positionAssignments.find((entry: any) => entry.drawPosition === drawPosition);
  if (assignment?.participantId) return 'P';
  return assignment?.bye ? 'BYE' : '-';
}

function apply(drawId: string, step: any, allowChangePropagation: boolean) {
  const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
  const result = observeMutation({
    propagateExitStatus: config.propagateExitStatus,
    outcome: step.outcome,
    matchUpId: target.matchUpId,
    allowChangePropagation,
    drawId,
  });
  expect(result.error).toBeUndefined();
  expect(checkLoserSeatsDerived(drawId)).toEqual([]);
}

const matchUpAt = (drawId: string, at: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === at);

describe('an unclaimed BYE goes with the award that kept it', () => {
  it.each([false, true])('allowChangePropagation %s', (allowChangePropagation) => {
    setSubscriptions({});
    const drawId = `unclaimed-bye-${allowChangePropagation}`;
    expect(prepareDraw(config, drawId)).toEqual(true);
    for (const step of steps) apply(drawId, step, allowChangePropagation);

    // the award over the produced walkover keeps the loser seat's BYE, unclaimed
    expect(matchUpAt(drawId, 'West|1|2').matchUpStatus).toEqual('DOUBLE_WALKOVER');
    expect(matchUpAt(drawId, 'West|2|1')).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 1 });
    expect(seat(drawId, 'Southwest', 1)).toEqual('BYE');
    expect(matchUpAt(drawId, 'Southwest|1|1').sideExitProvenance?.[1]?.byeClaims).toBeUndefined();

    apply(drawId, dissolve, allowChangePropagation);

    // the award is taken back, West|2|1 will be played, and its loser has an open seat to arrive at
    expect(matchUpAt(drawId, 'West|1|2')).toMatchObject({ matchUpStatus: 'DEFAULTED', winningSide: 2 });
    expect(matchUpAt(drawId, 'West|2|1').matchUpStatus).toEqual('TO_BE_PLAYED');
    expect(matchUpAt(drawId, 'West|2|1').winningSide).toBeUndefined();
    expect(seat(drawId, 'Southwest', 1)).toEqual('-');
  });
});
