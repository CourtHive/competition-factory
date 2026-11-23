import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * CORRECTING A DOUBLE EXIT TO A SINGLE releases every advancement its BYE produced — including the one
 * that crossed a winner link into another structure.
 *
 * ## The defect it was written against
 *
 * Found by `correctionDivergenceDeep` on its first run (2 of the 9 severe cells, 2026-09-30) and traced
 * on DOUBLE_ELIMINATION 8/5, seed 7000066, `propagateExitStatus: false`, both progression policies:
 *
 *   - `Main|2|2` DOUBLE_WALKOVER feeds a BYE to `Backdraw|2|2`, which already held a BYE. BYE meets BYE
 *     and a BYE advances to `Backdraw|3|1`, then to `Backdraw|4|1`.
 *   - `Backdraw|2|1` is played. Its winner meets the BYE in `Backdraw|3|1`, advances to `Backdraw|4|1`,
 *     meets the BYE again and crosses the winner link into `Main|4|1` — the Backdraw finalist reached the
 *     Main final on two BYEs, one of them the double exit's.
 *   - `Main|2|2` is corrected to a WALKOVER. The BYE is withdrawn, and `positionClear` walks the Backdraw's
 *     rounds taking the finalist out of `Backdraw|3|1` and `Backdraw|4|1` — and stopped at the structure's
 *     edge. `Main|4|1` still seated them: `dp=[3]` where the direct entry has no drawPositions at all.
 *
 * `releaseLinkedWinnerAdvancement` existed for exactly this crossing, but only
 * `removeSubsequentRoundsParticipant` called it. `positionClear`'s round walk now calls it after each
 * removal, so the release follows the winner link out of the structure.
 *
 * ## Why the direct entry is the oracle
 *
 * The corrected path must end where a direct WALKOVER entry ends. Asserting a fixed shape would pin
 * whatever the engine does today; asserting equality with the direct path pins the invariant the deep
 * oracle measures, on the one cell it found.
 */

const played = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 3, winningSide: 1 },
      { side1Score: 6, side2Score: 3, winningSide: 1 },
    ],
  },
  winningSide: 1,
};
const walkover = { matchUpStatus: WALKOVER, winningSide: 1 };

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function findByKey(drawId: string, target: string) {
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  return matchUps.find((matchUp) => key(matchUp) === target);
}

/** Play the shape; when `correct` the double exit is entered first and then corrected to the single exit. */
function play({ drawId, correct }: { drawId: string; correct: boolean }) {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus: false } },
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 5, drawId }],
    nonRandom: 7000066,
  });
  tournamentEngine.setState(tournamentRecord);

  const steps: [string, any][] = [
    ['Main|1|3', played],
    ['Main|2|1', played],
    ['Main|2|2', correct ? { matchUpStatus: DOUBLE_WALKOVER } : walkover],
    ['Backdraw|2|1', played],
  ];
  if (correct) steps.push(['Main|2|2', walkover]);

  for (const [target, outcome] of steps) {
    const { matchUpId } = findByKey(drawId, target);
    const result: any = tournamentEngine.setMatchUpStatus({ allowChangePropagation: true, matchUpId, outcome, drawId });
    expect(result.success, `${target} ${JSON.stringify(outcome)}`).toEqual(true);
  }
}

it('releases the advancement a withdrawn BYE carried across the winner link', () => {
  play({ drawId: 'corrected', correct: true });

  // CONTROL: the arrangement under test happened — the finalist crossed on the double exit's BYE, so
  // once corrected the Backdraw final is back to the single BYE the direct path also seats.
  const backdrawFinal = findByKey('corrected', 'Backdraw|4|1');
  expect(backdrawFinal.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(backdrawFinal.sides.filter((side: any) => side.participantId)).toHaveLength(0);

  // THE DEFECT: the Backdraw finalist stayed in the Main final after the correction took them out of
  // every Backdraw round. Measured before the fix: `drawPositions: [3]`, one side seated.
  const mainFinal = findByKey('corrected', 'Main|4|1');
  expect(mainFinal.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(
    mainFinal.sides.filter((side: any) => side.participantId),
    'nobody has reached the Main final',
  ).toHaveLength(0);

  // THE INVARIANT: the corrected path ends where the direct entry ends.
  play({ drawId: 'direct', correct: false });
  const direct = findByKey('direct', 'Main|4|1');
  expect(mainFinal.drawPositions).toEqual(direct.drawPositions);
  expect(mainFinal.sides.map((side: any) => side.participantId)).toEqual(
    direct.sides.map((side: any) => side.participantId),
  );
});
