import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ABANDONED, CANCELLED, DEAD_RUBBER } from '@Constants/matchUpStatusConstants';

/**
 * A MATCHUP THAT WILL NEVER BE PLAYED STRANDS NOBODY, and neither does anything it feeds.
 *
 * CA, 2026-09-29: *"DEAD_RUBBER, CANCELLED, ABANDONED should all silence stalls. All of those say
 * that a matchup isn't ever going to be played (and any matchUps fed by the matchUp that won't be
 * played are also excluded)."*
 *
 * The draw is DOUBLE_ELIMINATION 16/13 at matrix seed 117 under the produced-exit policy, which
 * ends with four stalls in one chain:
 *
 *   Backdraw|4|2  one participant, waiting on a matchUp that holds two exits and nobody
 *   Backdraw|5|1  one participant, waiting on the winner of `Backdraw|4|2`
 *   Backdraw|6|1  one participant, waiting on the winner of `Backdraw|5|1`
 *   Main|5|1      the Main champion, waiting on a Backdraw champion who cannot exist
 *
 * Each feeds the next, so the last is three steps downstream of the first. One draw shows both
 * halves of the rule, and shows that FED is followed all the way down.
 *
 * (It used DOUBLE_ELIMINATION 8/7 at seed 77 until that draw stopped stalling: `settleHeldExits`.)
 */

const STATUSES = [DEAD_RUBBER, CANCELLED, ABANDONED].map((matchUpStatus) => ({ matchUpStatus }));
const DRAW_ID = 'never-to-be-played';

const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps ?? [];
const at = (structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps().find(
    (matchUp) =>
      matchUp.structureName === structureName &&
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition,
  );

function stalledAt(): string[] {
  const drawDefinition: any = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
  const found = (getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID }) as any).inconsistencies ?? [];
  return found
    .filter((finding: any) => finding.issueType === STALLED_POSITION)
    .map((finding: any) => matchUps().find((matchUp) => matchUp.matchUpId === finding.matchUpId))
    .map((matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`)
    .sort((a: string, b: string) => a.localeCompare(b));
}

function play() {
  const cell = MATRIX_CELLS.find(({ seed }) => seed === 117);
  expect(playMatrixCell(cell as any, DRAW_ID, 'exits', PRODUCED_EXIT_POLICY)).toEqual(true);
}

function setStatus(matchUp: any, matchUpStatus: string) {
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus },
    matchUpId: matchUp.matchUpId,
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);
  expect(matchUps().find((m) => m.matchUpId === matchUp.matchUpId).matchUpStatus).toEqual(matchUpStatus);
}

const CHAIN = ['Backdraw|4|2', 'Backdraw|5|1', 'Backdraw|6|1', 'Main|5|1'];

// CONTROL: the stalls are there, and the chain between them is what the docblock says it is
it('has four stalls in one chain before anything is declared', () => {
  play();
  expect(stalledAt()).toEqual(CHAIN);

  expect(at('Backdraw', 4, 2).winnerMatchUpId).toEqual(at('Backdraw', 5, 1).matchUpId);
  expect(at('Backdraw', 5, 1).winnerMatchUpId).toEqual(at('Backdraw', 6, 1).matchUpId);
  expect(at('Backdraw', 6, 1).winnerMatchUpId).toEqual(at('Main', 5, 1).matchUpId);
});

it.each(STATUSES)('$matchUpStatus silences the stall in the matchUp that carries it', ({ matchUpStatus }) => {
  play();
  setStatus(at('Main', 5, 1), matchUpStatus);

  // and ONLY that one: the stalls upstream of it are fed by nothing that was declared
  expect(stalledAt()).toEqual(CHAIN.slice(0, 3));
});

it.each(STATUSES)('$matchUpStatus silences every stall in what the matchUp feeds', ({ matchUpStatus }) => {
  play();
  setStatus(at('Backdraw', 4, 2), matchUpStatus);

  expect(stalledAt()).toEqual([]);
});

it.each(STATUSES)('$matchUpStatus leaves the stalls UPSTREAM of the matchUp that carries it', ({ matchUpStatus }) => {
  play();
  setStatus(at('Backdraw', 5, 1), matchUpStatus);

  expect(stalledAt()).toEqual(['Backdraw|4|2']);
});
