import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, COMPLETED, WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION, COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * `STALLED_POSITION` — a participant in a match that can never be played, in a draw that has stopped.
 *
 * Measured 2026-09-23 and the reason this rule exists: COMPASS 16/14, **one** `DOUBLE_WALKOVER` at
 * `East|1|2`, play everything else — `Southwest|1|1` ends `(empty) vs Masanobu Mond` and
 * `getDrawInconsistencies` reported `valid: true` with ZERO findings. At 4 byes the same single
 * action strands THREE players.
 *
 * Two independent guards made every existing rule blind to it: `DRAW_POSITION_UNASSIGNED` requires a
 * `winningSide` (a stall has none) and `BYE_ADVANCEMENT_MISSING` requires bye-versus-participant (a
 * stall is VACANT-versus-participant). Four separate design briefs reported census numbers taken
 * with that blindness in place.
 *
 * ## The pending trap, which is the whole design constraint
 *
 * "Undecided, one participant, one vacant side" describes a stalled matchUp AND a legitimately
 * pending one awaiting a feed. Nothing about the matchUp separates them. `PROPAGATED_EXIT_LOST`
 * over-reports for exactly this reason — every one of its findings resolved when the draw was played
 * forward.
 *
 * So this rule is TERMINAL-SCOPED: it fires only when nothing in the draw is playable. If nothing is
 * playable, nothing is pending. The third test is the one that would catch a regression to the naive
 * version.
 */

const occupantsOf = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);

function compass(participantsCount: number) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount, drawId: 'A' }],
    nonRandom: 20223109,
    setState: true,
  });
  const matchUps = () => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: 'A' }).matchUps ?? [];
  const at = (structureName: string, roundNumber: number, roundPosition: number) =>
    matchUps().find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );

  const playAllPlayable = () => {
    let played = 1;
    while (played) {
      played = 0;
      for (const matchUp of matchUps() as any[]) {
        if (matchUp.winningSide || (matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED')) continue;
        if ((matchUp.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
        const outcome = { winningSide: 1 };
        const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: 'A', outcome });
        if (!result.error) played++;
      }
    }
  };

  const stalls = () => {
    const drawDefinition = tournamentEngine.getEvent({ drawId: 'A' }).drawDefinition;
    const result: any = getDrawInconsistencies({ drawDefinition });
    return (result.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);
  };

  return { at, playAllPlayable, stalls };
}

/**
 * COMPASS 16/14 NO LONGER STRANDS ANYBODY — and this test is now the regression guard for that.
 *
 * It was the rule's motivating case: `Southwest|1|1` ended `(empty) vs <participant>` and
 * `getDrawInconsistencies` rated the draw `valid: true`. `propagateUnfillableLoserBye` (punch-list
 * **P39**) resolves that seat as a BYE, because the matchUp feeding it produced an exit and can never
 * produce a loser, so the detector correctly reports **nothing** here.
 *
 * Kept rather than deleted, and inverted rather than relaxed: a count that went 1 -> 0 because a defect
 * was FIXED reads exactly like one that went 1 -> 0 because a detector was weakened, and the only way
 * to tell them apart later is to assert the FIXED STATE. So the BYE is asserted by name, not just the
 * absence of a finding. The detector's ability to fire is pinned separately, below.
 */
it('reports nothing on COMPASS 16/14, because the seat that stranded a player is now a BYE', () => {
  const { at, playAllPlayable, stalls } = compass(14);

  const source: any = at('East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId: 'A',
  });
  playAllPlayable();

  expect(stalls().length).toEqual(0);

  // the fixed state, asserted positively — a weakened detector would also report zero
  const southwest: any = at('Southwest', 1, 1);
  expect(southwest.matchUpStatus).toEqual(BYE);
  const drawDefinition: any = tournamentEngine.getEvent({ drawId: 'A' }).drawDefinition;
  const structure = drawDefinition.structures?.find((s: any) => s.structureName === 'Southwest');
  const assignment = (structure?.positionAssignments ?? []).find((a: any) => a.drawPosition === 1);
  expect(assignment?.byeFromPropagation).toEqual(true);
});

/**
 * ONE STALL, NOT THREE — corrected 2026-09-26 after re-measuring, and the drop is a genuine
 * unblocking rather than the detector going quiet.
 *
 * When this was written, COMPASS 16/12 stranded THREE players on a single `DOUBLE_WALKOVER` and this
 * test asserted 3. Two of the three have since been resolved by the P34 arc — #4983, #4985, #4987 —
 * and the measured answer is now 1.
 *
 * A falling count is exactly what a weakened detector also produces, so it was checked against a
 * definition that does NOT consult the detector: a real non-BYE participant, no `winningSide`, in a
 * terminal draw. All three matchUps are asserted BY NAME below, so the test now pins which ones were
 * fixed and which one remains, and a regression in any of them names itself instead of moving a
 * total from 1 to 2.
 *
 *   West|3|1        COMPLETED ws=1, 2 occupants     resolved
 *   West|2|1        WALKOVER  ws=2, 1 occupant      resolved -- #4985 awarded the carried exit
 *   Southwest|1|1   BYE (byeFromPropagation)        resolved -- P39, 2026-09-27
 *
 * **All three are now resolved, and the count is 0.** The last of them was P39: the seat is fed by a
 * matchUp that produced an exit and can never produce a loser, so it resolves as a BYE. This test now
 * asserts the FIXED STATE rather than a count, for the reason the test above states — a detector that
 * was weakened would also report zero.
 */
it('reports nothing on COMPASS 16/12 either, where the same seat is resolved', () => {
  const { at, playAllPlayable, stalls } = compass(12);

  const source: any = at('East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId: 'A',
  });
  playAllPlayable();

  expect(stalls().length).toEqual(0);

  // the seat, asserted by name and by marker rather than by the absence of a finding
  const southwest: any = at('Southwest', 1, 1);
  expect(southwest.matchUpStatus).toEqual(BYE);

  // and the two that P34's arc resolved, each asserted separately so a regression names itself
  const westThree: any = at('West', 3, 1);
  expect(westThree.matchUpStatus).toEqual(COMPLETED);
  expect(westThree.winningSide).toEqual(1);
  expect(occupantsOf(westThree).length).toEqual(2);

  const westTwo: any = at('West', 2, 1);
  expect(westTwo.matchUpStatus).toEqual(WALKOVER);
  expect(westTwo.winningSide).toEqual(2);
  expect(occupantsOf(westTwo).length).toEqual(1);
});

/**
 * THE REGRESSION GUARD for the naive version. A draw mid-play is FULL of matchUps holding one
 * participant and one vacant seat — every unplayed feed slot looks exactly like a stall. A rule that
 * dropped the terminal condition would light up here, which is what `PROPAGATED_EXIT_LOST` does.
 */
it('reports nothing while the draw is still being played', () => {
  const { at, stalls } = compass(14);

  const source: any = at('East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId: 'A',
  });

  // the double exit has produced a pending exit and vacant feed slots downstream, and the draw is
  // nowhere near finished
  expect(stalls().length).toEqual(0);
});

it('reports nothing on a draw that completes cleanly', () => {
  const { playAllPlayable, stalls } = compass(16);

  playAllPlayable();

  expect(stalls().length).toEqual(0);
});

/**
 * THE DETECTOR MUST STILL BE ABLE TO FIRE, and after P39 nothing in the default suite proved it.
 *
 * Both COMPASS cases above now report zero, which is the right answer and leaves a hole: a rule that
 * reports nothing anywhere is indistinguishable from a rule that has been switched off. The budget in
 * `stalledPositionBudget.test.ts` does assert a non-empty population, but it is INERT on `pnpm test`
 * and runs only under `pnpm verify` — so on an ordinary local run there would be no evidence at all.
 *
 * This is the other half of the pair the verification discipline asks for: one case where the rule is
 * silent because the draw is sound, and one where it speaks because the draw is not.
 *
 * `DOUBLE_ELIMINATION 8/5` at the matrix's own seed 87 strands a participant at `Backdraw|2|2`, which
 * ends `WALKOVER` holding one occupant — a shape P39 deliberately does NOT resolve, because the seat is
 * in the SAME structure rather than a first-round seat in a connected one. It is also the discriminator
 * the built artifact is verified against, so the two checks are about the same state.
 */
it('still fires where a stall remains — DOUBLE_ELIMINATION 8/5, matrix seed 87', () => {
  const cell = MATRIX_CELLS.find(({ seed }) => seed === 87);
  expect(cell?.drawType).toEqual(DOUBLE_ELIMINATION);
  expect(cell?.participantsCount).toEqual(5);

  const drawId = 'stalls-de-8-5';
  expect(playMatrixCell(cell as any, drawId)).toEqual(true);

  const drawDefinition: any = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const result: any = getDrawInconsistencies({ drawDefinition, drawId });
  const found = (result.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);

  expect(found.length).toBeGreaterThan(0);
  // advisory, never an error — the severity tier is what let this rule ship at all
  expect(found.every((i: any) => i.severity === 'warning')).toEqual(true);
  expect(result.valid).toEqual(true);

  // and the stall carries an EXIT status, which only the status-blind rule can see
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  const stalled: any = (matchUps as any[]).find((m) => m.matchUpId === found[0].matchUpId);
  expect(stalled.matchUpStatus).toEqual(WALKOVER);
  expect(stalled.winningSide).toBeUndefined();
});
