import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * TWO EXITS CONVERGE TO THE SAME DRAW IN EITHER ORDER, AND A LATE CONVERGENCE TAKES BACK ITS FIRST CARRIER'S LOSS
 * (exit propagation § Two carried exits converge: "the result is the draw that recording the two exits in the other
 * order leaves"; census run-17 baseline F3 MONOTONIC_DECISION, COMPASS 16/13 seed 20632071, policy off, one step).
 *
 * `East|1|2`'s walkover sends its loser d4e82f past `West|1|1`'s BYE into `West|2|1`, which their exit decides (RULE 2),
 * and on as its loser into `Southwest|1|1`. `East|1|4`'s double walkover then produces an exit that meets them at
 * `West|2|1`: the two converge, and a double exit has no loser. The convergence withdrew the exit d4e82f had carried
 * into `Southwest|1|1` but left d4e82f standing there, so the seat was not served as a double exit's loser target is —
 * which the other order does. A later result then took the stale seat back (MONOTONIC_DECISION).
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aLateConvergenceReleasesItsCarrier20632071.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const WALKOVER_EAST_1_2 = { at: 'East|1|2', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } };
const DOUBLE_EAST_1_4 = { at: 'East|1|4', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(schedule: { at: string; outcome: any }[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const { at, outcome } of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at);
    const observed = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  // read before the next draw is prepared: preparing replaces engine state
  const names = new Map(matchUps().map((matchUp) => [matchUp.matchUpId, coordinate(matchUp)]));
  return Object.fromEntries(
    matchUps().map((matchUp) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: matchUp.drawPositions,
        participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            {
              ...entry,
              sourceMatchUpId: names.get(entry?.sourceMatchUpId) ?? entry?.sourceMatchUpId,
              ...(entry?.byeClaims ? { byeClaims: entry.byeClaims.map((id: string) => names.get(id) ?? id) } : {}),
            },
          ]),
        ),
      },
    ]),
  );
}

it('the walkover then the double walkover leaves the draw the other order leaves', () => {
  expect(config.seed).toEqual(20632071);
  const walkoverFirst = play([WALKOVER_EAST_1_2, DOUBLE_EAST_1_4], 'late-convergence-walkover-first');
  const doubleFirst = play([DOUBLE_EAST_1_4, WALKOVER_EAST_1_2], 'late-convergence-double-first');

  expect(walkoverFirst['Southwest|1|1'].participants).not.toContain(
    play([WALKOVER_EAST_1_2], 'late-convergence-walkover-only')['West|2|1'].participants[0],
  );
  expect(walkoverFirst).toEqual(doubleFirst);
});
