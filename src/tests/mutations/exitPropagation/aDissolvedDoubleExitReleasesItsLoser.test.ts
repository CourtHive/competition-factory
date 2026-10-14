import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A DISSOLVED DOUBLE EXIT TAKES ITS CARRIER'S SEAT BACK FROM THE NEXT ROUND (census S4, F2 run 16, COMPASS 16/14
 * seed 20586104 under `doubleExitPropagateBye: false`, shrunk from 27 steps to 9).
 *
 * `West|2|1` was a double walkover: 312fa9 carried a walkover in on side 1, and `West|1|2`'s double walkover produced
 * one on side 2. Policy off, the double exit advanced its seats structurally, and `West|3|1` held 312fa9's dp 2.
 * Re-entering `East|1|4`'s walkover as RETIRED takes 2a6fd4's exit back: they win `West|1|2` and `West|2|1` re-derives
 * to the single WALKOVER they win against 312fa9's. 312fa9 is now that matchUp's LOSER, and their dp 2 stood in
 * `West|3|1` — the withdrawal released only vacant seats of a pending exit — so 2a6fd4, sent on as forward play sends
 * them, was refused ERR_EXISTING_POSITION_ASSIGNMENT after the correction had written.
 *
 * A correction the rules accept ends where forward play ends: the same results entered directly, the corrected
 * walkover never entered. Compared over the whole draw, by coordinate.
 */

const FIXTURE = path.join(
  __dirname,
  '../../fixtures/exitPropagation/aDissolvedDoubleExitReleasesItsLoser20586104.json',
);
const { config, steps } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

function play(schedule: any[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const step of schedule) {
    const target = matchUps().find(
      (matchUp) => coordinate(matchUp) === `${step.structureName}|${step.roundNumber}|${step.roundPosition}`,
    );
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    // a divergence the differential pipeline throws is caught into `thrown`, not `error`
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
        participants: (matchUp.sides ?? []).map((side: any) => side?.participantId),
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

it('re-entering East|1|4 as RETIRED ends where forward play ends', () => {
  expect(config.seed).toEqual(20586104);
  const corrected = play(steps, 'dissolved-double-exit-corrected');
  // forward: the same results, East|1|4 RETIRED from the first, its walkover never entered
  const forward = play([...steps.slice(0, 5), steps[8], ...steps.slice(6, 8)], 'dissolved-double-exit-forward');

  expect(corrected['West|2|1']).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 2 });
  expect(corrected).toEqual(forward);
});
