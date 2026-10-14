import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A BYE IN A STRUCTURE'S LAST ROUND TAKES BACK WHAT IT CARRIED ACROSS THE WINNER LINK (census run-17 baseline
 * DRAW_INCONSISTENCY WINNING_SIDE_ADVANCEMENT_MISMATCH, DOUBLE_ELIMINATION 8/5 seeds 20649692, 20703935 and 20712163,
 * allow-change-propagation).
 *
 * `Main|2|1`'s walkover sends its loser, carrying it, through the Backdraw to the Backdraw final. `Main|3|1`'s double
 * walkover gives the final's other seat a BYE, which carries them across the winner link into the Main final.
 * `Main|3|1` re-scored to a played win sends its loser into the BYE's seat; they win the Backdraw final by the carried
 * walkover. Removing a BYE takes back what it advanced into the next round of its structure, but the Backdraw final has
 * no next round: the advance was across the link, and the carrier stayed in the Main final in place of the winner.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aFinalByeTakesBackItsCrossing20649692.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  { at: 'Main|2|1', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
  { at: 'Main|1|3', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'Main|3|1', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'Main|3|1', outcome: { winningSide: 1 } },
];

it('the Backdraw final winner, not the carrier the withdrawn BYE passed, stands in the Main final', () => {
  expect(config.seed).toEqual(20649692);
  const previous = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  try {
    setSubscriptions({});
    const drawId = 'final-bye-crossing';
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
      expect(observed.invariantViolations ?? []).toEqual([]);
    }

    const backdrawFinal = at('Backdraw|4|1');
    const winner = backdrawFinal.sides[backdrawFinal.winningSide - 1].participantId;
    const carrier = backdrawFinal.sides[2 - backdrawFinal.winningSide].participantId;
    expect(backdrawFinal.matchUpStatus).toEqual('WALKOVER');
    const mainFinal = at('Main|4|1').sides.map((side: any) => side.participantId);
    expect(mainFinal).toContain(winner);
    expect(mainFinal).not.toContain(carrier);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
    else process.env.ALLOW_CHANGE_PROPAGATION = previous;
  }
});
