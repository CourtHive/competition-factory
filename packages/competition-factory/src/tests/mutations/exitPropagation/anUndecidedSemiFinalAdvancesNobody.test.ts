import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A MAIN SEMI-FINAL WITH NO RESULT ADVANCED NOBODY, SO THE BACKDRAW WINNER IN THE MAIN FINAL CAME ACROSS THE LINK
 * (census run-17 baseline DRAW_INCONSISTENCY ADVANCED_FROM_UNDECIDED, DOUBLE_ELIMINATION 8/4 seed 20650786,
 * allow-change-propagation).
 *
 * `Backdraw|3|1`'s double default produces a default into the Backdraw final. `Main|3|1` played sends its loser there,
 * who takes the default and crosses into the Main final under the Main position they held, the one they lost
 * `Main|3|1` on. `Main|3|1` cleared takes the loser back out of the Backdraw final, and the release across the link
 * asks whether the Main final holds that position by advancing within Main: their position is in `Main|3|1`, which the
 * same clear has just left undecided, and an undecided matchUp was read as an advance within. It advances nobody, so
 * the loser stayed in the Main final with nothing behind them.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/anUndecidedSemiFinalAdvancesNobody20650786.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  { at: 'Main|2|2', outcome: { winningSide: 2 } },
  { at: 'Main|2|1', outcome: { winningSide: 1 } },
  { at: 'Backdraw|3|1', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
  { at: 'Main|3|1', outcome: { winningSide: 1 } },
  { at: 'Main|3|1', outcome: { matchUpStatus: 'TO_BE_PLAYED', score: { scoreStringSide1: '', scoreStringSide2: '' } } },
];

it('clearing the Main semi-final empties the Main final', () => {
  expect(config.seed).toEqual(20650786);
  const previous = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  try {
    setSubscriptions({});
    const drawId = 'undecided-semi-final';
    expect(prepareDraw(config, drawId)).toBe(true);
    const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
    const at = (where: string) => matchUps().find((matchUp) => coordinate(matchUp) === where);
    for (const { at: where, outcome } of SCHEDULE) {
      const observed = observeMutation({
        propagateExitStatus: config.propagateExitStatus,
        matchUpId: at(where).matchUpId,
        outcome,
        drawId,
      });
      expect(observed.error).toBeUndefined();
      expect(observed.thrown).toBeUndefined();
    }

    expect(at('Main|3|1').matchUpStatus).toEqual('TO_BE_PLAYED');
    expect(at('Main|4|1').sides.filter((side: any) => side.participantId)).toEqual([]);
    const { inconsistencies } = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) });
    expect((inconsistencies ?? []).map((inconsistency: any) => inconsistency.issueType)).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
    else process.env.ALLOW_CHANGE_PROPAGATION = previous;
  }
});
