import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterAll, beforeAll, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import path from 'path';
import fs from 'fs';

/**
 * A WITHDRAWN EXIT THAT MOVES AN AWARD RELEASES WHAT THE OLD AWARD ADVANCED (census S4, F2 run 16,
 * DOUBLE_ELIMINATION 16/14 seed 20617910 under `allowChangePropagation`, shrunk from 26 steps to 9).
 *
 * `Backdraw|3|2` held two exits: the walkover `Backdraw|2|3`'s double walkover produced on side 1, with nobody there,
 * and the walkover 113652 carried in on side 2. It read WALKOVER won by side 2, and 113652 went on into `Backdraw|4|2`.
 * Correcting `Main|2|3` from a walkover to a played win dissolves that double walkover: its produced exit is
 * withdrawn and `Backdraw|3|2` re-derives to the kept exit — still a WALKOVER, now won by the empty seat 113652's
 * walkover leaves (RULE 2). The withdrawal compared the status alone, saw WALKOVER = WALKOVER, kept the stale award
 * and never released 113652 from `Backdraw|4|2`; the winner of `Backdraw|2|3`, arriving to take the seat, was then
 * refused ERR_EXISTING_POSITION_ASSIGNMENT after the correction had written.
 *
 * A correction the rules accept ends where forward play ends: the same results entered directly, the corrected
 * walkover never entered. Compared over the whole draw, by coordinate.
 */

const FIXTURE = path.join(
  __dirname,
  '../../fixtures/exitPropagation/aWithdrawnExitReleasesTheAwardItMoved20617910.json',
);
const { config, steps } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

let priorFlag: string | undefined;
beforeAll(() => {
  priorFlag = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
});
afterAll(() => {
  if (priorFlag === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
  else process.env.ALLOW_CHANGE_PROPAGATION = priorFlag;
});

function play(schedule: any[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toBe(true);
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

it('correcting Main|2|3 from a walkover to a played win ends where forward play ends', () => {
  expect(config.seed).toEqual(20617910);
  const corrected = play(steps, 'withdrawn-exit-corrected');
  // forward: the same results, Main|2|3 played from the first, its walkover never entered
  const forward = play([...steps.slice(0, 4), steps[8], ...steps.slice(5, 8)], 'withdrawn-exit-forward');

  expect(corrected['Backdraw|3|2']).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 1 });
  expect(corrected).toEqual(forward);
});
