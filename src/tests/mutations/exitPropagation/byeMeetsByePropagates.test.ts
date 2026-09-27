import { MATRIX_CELLS, cellExitOutcome, cellLabel } from '@Tests/testHarness/exitPropagation/matrixCells';
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, BYE } from '@Constants/matchUpStatusConstants';

/**
 * **A BYE IS NEVER WON, AND TWO BYES PRODUCE A BYE.** CA, 2026-09-27:
 *
 * > `BYE_WON` likely means that another side needs to be progressed as there can never be
 * > `{ winningSide }` with a value in a matchUp with `matchUpStatus: BYE`. If two BYEs encounter each
 * > other then a BYE is produced for the next matchUp, rinse and repeat.
 *
 * Two separate claims, so two separate assertions — one test that fails for either reason tells you
 * nothing about which half broke.
 *
 * ## Why this is a pin and not a fix
 *
 * Both halves were MEASURED to hold before this test existed: over the 240 double-exit cells of the
 * matrix with `doubleExitPropagateBye` attached, **391 BYE-versus-BYE pairs, 300 propagated onward, 0
 * misses** (the other 91 are finals, which have nothing downstream to receive anything). So this adds
 * no behaviour. It exists because an unasserted measurement decays: the "rinse and repeat" clause is
 * the kind of rule a later cascade change breaks silently, and `BYE_WON` has already been reintroduced
 * once — #4988 removed the refusal that `getExitWinningSide`'s `undefined` carried, and the count went
 * 0 → 13 before `byeIsNeverAwarded.test.ts` pinned the side-level half of the rule.
 *
 * This test covers the two claims that file does not: the matchUp-level one (a matchUp whose STATUS is
 * `BYE` carrying a `winningSide`) and the propagation one (a BYE meeting a BYE hands a BYE onward).
 *
 * The policy is attached the way a consumer attaches it rather than flipped as a default, which is
 * what makes these shapes reachable from the suite at all — see the same note in
 * `byeIsNeverAwarded.test.ts`.
 */

const CELLS = MATRIX_CELLS.filter((cell) => [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(cell.exitStatus));

const byeSides = (matchUp: any) => (matchUp?.sides ?? []).filter((side: any) => side?.bye);
const occupants = (matchUp: any) => (matchUp?.sides ?? []).filter((side: any) => side?.participantId && !side?.bye);

function playAllCells(): { byeStatusWithWinner: string[]; byeVsBye: number; propagated: number; misses: string[] } {
  const byeStatusWithWinner: string[] = [];
  const misses: string[] = [];
  let byeVsBye = 0;
  let propagated = 0;

  for (const cell of CELLS) {
    setSubscriptions({});
    const drawId = `bvb-${cell.seed}`;
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
    const all = matchUps as any[];

    for (const matchUp of all) {
      // CLAIM 1 — a matchUp whose STATUS is BYE can never carry a winningSide.
      if (matchUp.matchUpStatus === BYE && matchUp.winningSide) {
        byeStatusWithWinner.push(
          `${cellLabel(cell)} — ${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition} ` +
            `is ${BYE} yet awards side ${matchUp.winningSide}`,
        );
      }

      // CLAIM 2 — two BYEs meeting hand a BYE onward, and repeat.
      if (byeSides(matchUp).length !== 2 || occupants(matchUp).length) continue;
      byeVsBye += 1;
      const target = all.find((candidate) => candidate.matchUpId === matchUp.winnerMatchUpId);
      // a final has nothing downstream to receive anything; that is not a miss.
      if (!target) continue;
      if (byeSides(target).length) {
        propagated += 1;
        continue;
      }
      misses.push(
        `${cellLabel(cell)} — ${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition} ` +
          `is BYE vs BYE but its winner target ${target.structureName}|${target.roundNumber}|${target.roundPosition} ` +
          `has no BYE side (${target.matchUpStatus ?? 'TO_BE_PLAYED'})`,
      );
    }
  }

  return { byeStatusWithWinner, byeVsBye, propagated, misses };
}

const result = playAllCells();

it('reaches the shapes the rule is about', () => {
  // CONTROLS. Both assertions below can pass by finding nothing, so the shapes have to be shown to
  // exist first — this is the guard that keeps the test from going quietly vacuous if the matrix, the
  // driver or the policy name changes under it.
  expect(CELLS.length).toBeGreaterThan(0);
  expect(result.byeVsBye).toBeGreaterThan(0);
});

it('never carries a winningSide on a matchUp whose status is BYE', () => {
  expect(result.byeStatusWithWinner).toEqual([]);
});

it('produces a BYE for the next matchUp when two BYEs meet', () => {
  expect(result.misses).toEqual([]);
  // and the propagation is the common case, not an exception that happened to hold twice
  expect(result.propagated).toBeGreaterThan(result.byeVsBye / 2);
});
