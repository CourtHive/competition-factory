import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN OCCUPANT WHO EXITED IS NOT WAITING FOR ANYBODY.
 *
 * CA, 2026-09-29, of a converged double exit holding one occupant who themselves exited: *"There is
 * nothing to be done and it needs to be considered a valid end state."*
 *
 * Two halves, because the rule is only worth having if it is narrow. The first is the draw CA was
 * shown. The second is the state the rule's status-blindness exists to catch — an exit stamped onto
 * a matchUp somebody is still waiting in — and it must go on being reported.
 */

const DRAW_ID = 'exited-occupant';

const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps ?? [];
const at = (structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps().find(
    (matchUp) =>
      matchUp.structureName === structureName &&
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition,
  );
const occupantsOf = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side.participantId && !side.bye);

function play(seed: number) {
  const cell = MATRIX_CELLS.find((candidate) => candidate.seed === seed);
  expect(playMatrixCell(cell as any, DRAW_ID, 'exits', PRODUCED_EXIT_POLICY)).toEqual(true);
}

const stalledIn = (drawDefinition: any, matchUpId: string) =>
  ((getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID }) as any).inconsistencies ?? []).filter(
    (finding: any) => finding.issueType === STALLED_POSITION && finding.matchUpId === matchUpId,
  );

const storedMatchUp = (drawDefinition: any, matchUpId: string) =>
  drawDefinition.structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);

const carriedExit = { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sourceMatchUpId: 'elsewhere' };

it('does not report the lone occupant of a converged double exit — COMPASS 16/16, seed 511', () => {
  play(511);
  const converged = at('Southeast', 1, 1);

  // CONTROL: the state CA was shown. One occupant, no winner, and BOTH sides arrived carrying an exit
  expect(converged.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged.winningSide).toBeUndefined();
  expect(occupantsOf(converged).length).toEqual(1);
  expect(converged.sideExitProvenance?.[1]?.matchUpStatus).toEqual(WALKOVER);
  expect(converged.sideExitProvenance?.[2]?.matchUpStatus).toEqual(WALKOVER);

  // CONTROL: and the rule had its chance — nothing in the draw is playable, which is its first condition
  const playable = matchUps().filter((matchUp) => !matchUp.winningSide && occupantsOf(matchUp).length === 2);
  expect(playable.filter((matchUp) => matchUp.matchUpStatus === 'TO_BE_PLAYED')).toEqual([]);

  const drawDefinition: any = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
  const result: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect(result.inconsistencies ?? []).toEqual([]);
  expect(result.valid).toEqual(true);
});

it('still reports somebody waiting OPPOSITE an exit, and stops only when the exit is their own', () => {
  // DOUBLE_ELIMINATION 16/13: `Backdraw|4|2` holds one participant who is waiting, and no exit at all
  play(117);
  const waiting = at('Backdraw', 4, 2);
  const [occupant] = occupantsOf(waiting);
  const vacantSideNumber = 3 - occupant.sideNumber;

  const drawDefinition: any = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
  const stored = storedMatchUp(drawDefinition, waiting.matchUpId);

  // CONTROL: reported as it stands
  expect(stored.sideExitProvenance).toBeUndefined();
  expect(stalledIn(drawDefinition, waiting.matchUpId).length).toEqual(1);

  // 1. an exit stamped on the VACANT side, status and all: the occupant is exactly as stranded
  stored.sideExitProvenance = { [vacantSideNumber]: carriedExit };
  stored.matchUpStatus = WALKOVER;
  expect(stalledIn(drawDefinition, waiting.matchUpId).length).toEqual(1);

  // 2. the same exit on the OCCUPANT'S side: they are not waiting, they have left
  stored.sideExitProvenance = { [occupant.sideNumber]: carriedExit };
  expect(stalledIn(drawDefinition, waiting.matchUpId)).toEqual([]);
});
