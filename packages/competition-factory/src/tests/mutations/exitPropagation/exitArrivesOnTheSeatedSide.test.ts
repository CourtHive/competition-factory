import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A PRODUCED EXIT ARRIVES ON THE SIDE ITS SEAT ALREADY HOLDS, not on the side its feeder's
 * roundPosition predicts.
 *
 * ## The defect it was written against
 *
 * `correctionDivergenceDeep`, 2 of its first 9 severe cells (2026-09-30): FIRST_MATCH_LOSER_CONSOLATION
 * 8/5 with `doubleExitPropagateBye: false`, `Main|2|2` a DOUBLE_WALKOVER entered directly.
 *
 *   - `Main|2|2`'s loser seat is Consolation 2, beside the BYE on seat 5, so seat 2 was advanced into
 *     `Consolation|3|1` at generation. After `Main|2|1` is played the final reads `[2, 4]`: seat 2
 *     on side 1 (rule 3 of `draw-positions.md`), the `Consolation|2|1` winner on side 2.
 *   - The double exit stamps its produced WALKOVER on the BYE-held `Consolation|2|2` and sets out to
 *     carry it onward. `getExitArrivalSideNumber` ordered the final's feeders by roundPosition —
 *     `Consolation|2|2` is second — and answered side 2, where it found the participant and declined:
 *     *exit_not_carried_arriving_side_occupied*.
 *   - The final stayed TO_BE_PLAYED with one participant and an opponent who could never come.
 *
 * Fed seat numbers interleave with advanced ones — seats 1, 2 are fed and 4, 5 advanced, so the
 * `Consolation|2|2` seat is the LOWER number in the final — and roundPosition order is the wrong
 * predictor exactly there. When the seat is already in the target, its side is read, not predicted.
 *
 * Why this is pinned on the DIRECT entry: the correction route reached the right end state by
 * accident — clearing the walkover's loser had withdrawn seat 2 from the final, so the side the
 * feeder order named happened to be free.
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

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function findByKey(drawId: string, target: string) {
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  return matchUps.find((matchUp) => key(matchUp) === target);
}

it('carries a produced exit onto the side its seat already holds in the next round', () => {
  setSubscriptions({});
  const drawId = 'seated-side';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false, propagateExitStatus: false } },
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 5, drawId }],
    nonRandom: 7000598,
  });
  tournamentEngine.setState(tournamentRecord);

  for (const [target, outcome] of [
    ['Main|1|2', played],
    ['Main|2|1', played],
  ] as [string, any][]) {
    const { matchUpId } = findByKey(drawId, target);
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
    expect(result.success, target).toEqual(true);
  }

  // CONTROL: the arrangement under test — the fed seat 2 is already in the final on side 1, and
  // the Consolation|2|1 winner sits on side 2
  const before = findByKey(drawId, 'Consolation|3|1');
  expect(before.drawPositions).toEqual([2, 4]);
  expect(before.sides.map((side: any) => side.sideNumber)).toEqual([1, 2]);
  expect(before.sides[1].participantId).toBeDefined();
  expect(before.sides[0].participantId).toBeUndefined();

  const { matchUpId } = findByKey(drawId, 'Main|2|2');
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId,
  });
  expect(result.success).toEqual(true);

  // CONTROL: the exit was recorded on the BYE-held consolation matchUp the loser link names
  const held = findByKey(drawId, 'Consolation|2|2');
  expect(held.sideExitProvenance?.[1]?.matchUpStatus).toEqual(WALKOVER);

  // THE DEFECT: the final stayed TO_BE_PLAYED with nothing on side 1. Measured before the fix.
  const final = findByKey(drawId, 'Consolation|3|1');
  expect(final.matchUpStatus, 'the exit reached the final').toEqual(WALKOVER);
  expect(final.sideExitProvenance?.[1]?.matchUpStatus, 'on the side its seat holds').toEqual(WALKOVER);
  expect(final.winningSide, 'and the side without the exit wins').toEqual(2);
});
