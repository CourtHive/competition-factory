import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A SEAT THAT EMPTIES IS READ IN THE STATE IT LEAVES, NOT THE ONE IT REPLACES (census run-17 baseline F2
 * ERROR_IMPLIES_NO_MUTATION, DOUBLE_ELIMINATION 16/14 seed 20751564, `ERR_EXISTING_POSITION_ASSIGNMENT`).
 *
 * `Main|2|4`'s walkover carries its loser, dp 7, past `Backdraw|2|4`'s BYE into `Backdraw|3|2` on side 2, where the
 * walkover waits for whoever reaches side 1. `Main|1|5`'s double walkover sends dp 12 past `Backdraw|2|3`'s BYE into
 * that side and wins it; two positions sort ascending, so dp 7 moves to side 1 and the award to dp 12 is `winningSide:
 * 2`. `Main|1|4` re-scored takes dp 12 back, and dp 7 should return to side 2, the award to the empty side 1. It stayed
 * `winningSide: 2`, now naming dp 7, the participant the walkover was against: the lone position's side was read
 * through a round profile built from the stored `[7, 12]` the write was replacing. The next arrival then advanced dp 12
 * into a seat dp 7 already held, and was refused after the draw had changed.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aSeatThatEmptiesReadsItsOwnSide20751564.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  { at: 'Main|1|2', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'Main|2|4', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'Main|1|3', outcome: { winningSide: 2 } },
  { at: 'Main|1|4', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
  { at: 'Main|1|5', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'Main|1|4', outcome: { winningSide: 1 } },
  { at: 'Main|1|2', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'Backdraw|1|3', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
];

it('the award returns to the empty side when the position that won it is taken back', () => {
  expect(config.seed).toEqual(20751564);
  setSubscriptions({});
  const drawId = 'seat-empties';
  expect(prepareDraw(config, drawId)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const at = (where: string) => matchUps().find((matchUp) => coordinate(matchUp) === where);

  SCHEDULE.forEach(({ at: where, outcome }, index) => {
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: at(where).matchUpId,
      outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();

    if (index === 4) {
      const won = at('Backdraw|3|2');
      expect(won.drawPositions).toEqual([7, 12]);
      expect(won.winningSide).toEqual(2);
      expect(Object.keys(won.sideExitProvenance)).toEqual(['1']);
    }
    if (index === 5) {
      const emptied = at('Backdraw|3|2');
      expect(emptied.matchUpStatus).toEqual('WALKOVER');
      expect(emptied.drawPositions).toEqual([7]);
      expect(emptied.sides.map((side: any) => side.drawPosition)).toEqual([undefined, 7]);
      expect(emptied.winningSide).toEqual(1);
      expect(Object.keys(emptied.sideExitProvenance)).toEqual(['2']);
    }
  });
});
