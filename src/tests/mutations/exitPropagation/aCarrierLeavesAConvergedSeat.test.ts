import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A LATE CONVERGENCE TAKES ITS FIRST CARRIER BACK OUT OF A LOSER SEAT WHERE THE CARRIED EXITS HAVE THEMSELVES CONVERGED,
 * AND ALL SIX RECORDING ORDERS LEAVE ONE DRAW (census s14 ERROR_IMPLIES_NO_MUTATION, COMPASS 32/27 seed 20517704,
 * `doubleExitPropagateBye: false`; seed 20521746 is the same shape).
 *
 * `East|1|15`'s and `East|1|11`'s walkovers send their losers past BYEs into `West|2|4` and `West|2|3`, which their exits
 * decide (RULE 2), and on as those matchUps' losers into `Southwest|1|2`, where the two exits converge. `East|1|13`'s
 * double default then converges at `West|2|4`: a double exit has no loser, so its first carrier leaves
 * `Southwest|1|2`. The position clear was refused there as active after the draw had moved. The carrier now leaves the
 * seat, which the convergence's own exit serves, and `Southwest|1|2` stands as the double walkover every other order
 * leaves.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aCarrierLeavesAConvergedSeat20517704.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const STEPS = [
  { at: 'East|1|15', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'East|1|11', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
  { at: 'East|1|13', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
];
const orders = (steps: typeof STEPS): (typeof STEPS)[] =>
  steps.length <= 1
    ? [steps]
    : steps.flatMap((step, index) =>
        orders([...steps.slice(0, index), ...steps.slice(index + 1)]).map((rest) => [step, ...rest]),
      );
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
// `West|3|2` is read only for its status: which origin it records for a side nobody reached differs by order, apart
const comparable = (draw: any) => ({ ...draw, 'West|3|2': draw['West|3|2'].matchUpStatus });

function play(schedule: { at: string; outcome: any }[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const { at, outcome } of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at);
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
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

it('every recording order of the three exits leaves the same draw, and none is refused', () => {
  expect(config.seed).toEqual(20517704);
  const draws = orders(STEPS).map((order, index) => comparable(play(order, `converged-seat-${index}`)));

  expect(draws[0]['Southwest|1|2'].matchUpStatus).toEqual('DOUBLE_WALKOVER');
  expect(draws[0]['Southwest|1|2'].participants.filter(Boolean)).toHaveLength(1);
  for (const draw of draws.slice(1)) expect(draw).toEqual(draws[0]);
});
