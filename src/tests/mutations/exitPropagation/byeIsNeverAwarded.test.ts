import { MATRIX_CELLS, cellExitOutcome, cellLabel } from '@Tests/testHarness/exitPropagation/matrixCells';
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * **A BYE IS NEVER AWARDED THE MATCH**, with `doubleExitPropagateBye` attached.
 *
 * CA, 2026-09-27: *"there can never be `{ winningSide }` with a value in a matchUp with
 * `matchUpStatus: BYE`. If two BYEs encounter each other then a BYE is produced for the next matchUp,
 * rinse and repeat."*
 *
 * ## Why this test exists, and it is a regression I introduced
 *
 * `getExitWinningSide` returns `undefined` for a BYE drawPosition deliberately — *"A BYE draw position
 * can never be the winning side"* — and `advanceByeAdvancedDrawPosition` relied on that `undefined` as
 * its refusal to award anything. #4988 replaced the `!occupiedSide` gate with `!exitSideNumber`, where
 * the structural `arrivalSideNumber` resolves even for a BYE, so the refusal stopped firing.
 *
 * Measured over `src/tests/mutations/exitPropagation` with the default flipped ON: **`BYE_WON` 0 → 13**
 * across `DOUBLE_ELIMINATION 16/13` and `FIRST_MATCH_LOSER_CONSOLATION` 16/13 and 16/15. The clearest
 * instance is `Backdraw|3|2`, which ends `WALKOVER ws=2` holding a hole on side 1 and a propagated BYE
 * on side 2 — **no participant anywhere in the matchUp** — so the walkover is awarded to the BYE.
 *
 * ## It is pinned WITHOUT flipping the default
 *
 * The policy is attached the way a consumer attaches it, which is also how
 * `doubleExitPropagateBye.test.ts` does it. That matters: the defect is only reachable on this path
 * today, so a test that needed the default flipped could not exist in the suite at all, and the
 * regression would stay invisible until somebody tried the flip again.
 *
 * The assertion is a PROPERTY over the whole draw rather than one coordinate: no decided matchUp may
 * award a side that holds a BYE. Stated that way it also covers the BYE-versus-BYE case CA describes,
 * where the answer is a BYE onward rather than a winner.
 */

const CELLS = MATRIX_CELLS.filter(
  (cell) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(cell.exitStatus) &&
    ((cell.drawType === DOUBLE_ELIMINATION && cell.participantsCount === 13) ||
      (cell.drawType === FIRST_MATCH_LOSER_CONSOLATION && [13, 15].includes(cell.participantsCount))),
);

it('never awards a matchUp to a side holding a BYE, with doubleExitPropagateBye attached', () => {
  // CONTROL: the cell filter must actually select the shapes that broke, or this asserts over nothing
  expect(CELLS.length).toBeGreaterThan(0);

  const offences: string[] = [];
  for (const cell of CELLS) {
    setSubscriptions({});
    const drawId = `bye-award-${cell.seed}`;
    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
      ],
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: true } },
      nonRandom: cell.seed,
      setState: true,
    });
    if (!drawIds?.includes(drawId)) continue;

    const outcome = cellExitOutcome(cell.exitStatus);
    const lead = nextPlayable(drawId);
    if (lead?.matchUpId) {
      step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: lead.matchUpId, drawId, outcome });
    }
    playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId });

    const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    for (const matchUp of matchUps as any[]) {
      if (!matchUp.winningSide) continue;
      const winner = (matchUp.sides ?? []).find((side: any) => side?.sideNumber === matchUp.winningSide);
      if (!winner?.bye) continue;
      offences.push(
        `${cellLabel(cell)} — ${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition} ` +
          `${matchUp.matchUpStatus} awards side ${matchUp.winningSide}, which is a BYE (drawPosition ${winner.drawPosition})`,
      );
    }
  }

  expect(offences).toEqual([]);
});
