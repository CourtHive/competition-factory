import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN EXIT HELD IN A MATCHUP THAT CAN PRODUCE NOBODY IS SENT ON.
 *
 * CA, 2026-09-29, of `doubleExitPropagateBye: false`: *"why aren't produced exits meeting BYEs being
 * advanced? I think [the] repair should be done!"*
 *
 * They are advanced when the BYE is already there as the exit arrives. They were not when the facts
 * arrived in the other order, because every decision the carrier takes is taken once, on the draw as
 * it stood. `settleHeldExits` asks again once the draw has settled.
 *
 * Each case is a matrix cell played under the produced-exit policy, and each was a stall.
 */

const DRAW_ID = 'held-exit';

const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps ?? [];
const at = (structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps().find(
    (matchUp) =>
      matchUp.structureName === structureName &&
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition,
  );
const participantsIn = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side.participantId && !side.bye);
const holdsBye = (matchUp: any) => (matchUp.sides ?? []).some((side: any) => side.bye);
const carriesExit = (matchUp: any) =>
  Object.values(matchUp.sideExitProvenance ?? {}).some((origin: any) => origin.matchUpStatus === WALKOVER);

function stalls() {
  const drawDefinition: any = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
  const found = (getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID }) as any).inconsistencies ?? [];
  return found.filter((finding: any) => finding.issueType === STALLED_POSITION);
}

function play(seed: number, expected: { drawType: string; participantsCount: number }) {
  const cell = MATRIX_CELLS.find((candidate) => candidate.seed === seed);
  expect(cell?.drawType).toEqual(expected.drawType);
  expect(cell?.participantsCount).toEqual(expected.participantsCount);
  expect(playMatrixCell(cell as any, DRAW_ID, 'exits', PRODUCED_EXIT_POLICY)).toEqual(true);
}

it('sends the exit on when the BYE arrives second — DOUBLE_ELIMINATION 8/7, seed 77', () => {
  play(77, { drawType: 'DOUBLE_ELIMINATION', participantsCount: 7 });

  // CONTROL: the state under test. `Backdraw|2|2` holds a BYE and an exit, and nobody
  const holder = at('Backdraw', 2, 2);
  expect(holdsBye(holder)).toEqual(true);
  expect(carriesExit(holder)).toEqual(true);
  expect(participantsIn(holder)).toEqual([]);
  // and the BYE remains a BYE
  expect(holder.matchUpStatus).toEqual(BYE);

  // 1. the exit reached the matchUp the holder feeds, and the participant waiting there won it
  const target = at('Backdraw', 3, 1);
  expect(target.matchUpStatus).toEqual(WALKOVER);
  expect(participantsIn(target).length).toEqual(1);
  expect(target.winningSide).toEqual(participantsIn(target)[0].sideNumber);

  // 2. who then advanced through the BYE in the Backdraw final AND across the link into the Main final
  const winnerId = participantsIn(target)[0].participantId;
  expect(participantsIn(at('Backdraw', 4, 1)).map((side: any) => side.participantId)).toEqual([winnerId]);
  const mainFinal = at('Main', 4, 1);
  expect(participantsIn(mainFinal).map((side: any) => side.participantId)).toContain(winnerId);
  expect(mainFinal.matchUpStatus).toEqual(COMPLETED);

  // 3. nobody is stranded
  expect(stalls()).toEqual([]);
});

it('sends the exit on when the OPPONENT arrives second — FEED_IN_CHAMPIONSHIP 8/7, seed 377', () => {
  play(377, { drawType: 'FEED_IN_CHAMPIONSHIP', participantsCount: 7 });

  const holder = at('Consolation', 2, 2);
  expect(holdsBye(holder)).toEqual(true);
  expect(carriesExit(holder)).toEqual(true);
  expect(participantsIn(holder)).toEqual([]);
  expect(holder.matchUpStatus).toEqual(BYE);

  const target = at('Consolation', 3, 1);
  expect(target.matchUpStatus).toEqual(WALKOVER);
  expect(participantsIn(target).length).toEqual(1);
  expect(target.winningSide).toEqual(participantsIn(target)[0].sideNumber);

  expect(stalls()).toEqual([]);
});
