import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

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

it('reports a participant stranded by a single double walkover', () => {
  const { at, playAllPlayable, stalls } = compass(14);

  const source: any = at('East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId: 'A',
  });
  playAllPlayable();

  const found = stalls();
  expect(found.length).toEqual(1);
  expect(found[0].issueType).toEqual(STALLED_POSITION);
  // the stranded matchUp is the one holding exactly one participant
  const stalled: any = at('Southwest', 1, 1);
  expect(found[0].matchUpId).toEqual(stalled.matchUpId);
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
 *   Southwest|1|1   TO_BE_PLAYED, 1 occupant        STILL STRANDED -- punch-list P39
 *
 * `Southwest|1|1` is P39: `propagateConsolationBye` is gated on `linkCondition === FIRST_MATCHUP`,
 * and COMPASS legitimately has no such link, so the BYE that would fill that seat is unreachable by
 * construction. When P39 lands this test should go to 0 and the `Southwest` row below becomes the
 * thing to update — deliberately, not by relaxing the count.
 */
it('reports the one participant COMPASS 16/12 still strands, and names the two now resolved', () => {
  const { at, playAllPlayable, stalls } = compass(12);

  const source: any = at('East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId: 'A',
  });
  playAllPlayable();

  const found = stalls();
  expect(found.length).toEqual(1);

  // the survivor, by name rather than by count
  const southwest: any = at('Southwest', 1, 1);
  expect(found[0].matchUpId).toEqual(southwest.matchUpId);
  expect(occupantsOf(southwest).length).toEqual(1);
  expect(southwest.winningSide).toBeUndefined();

  // and the two that were resolved, each asserted separately so a regression names itself
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
