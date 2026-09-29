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
 * The draw is DOUBLE_ELIMINATION 8/7 at matrix seed 77 under the produced-exit policy, which ends
 * with two stalls in one chain:
 *
 *   Backdraw|3|1  one participant, the other seat fed by a BYE matchUp that holds nobody
 *   Main|4|1      the Main champion, waiting on a Backdraw champion who cannot exist
 *
 * `Backdraw|3|1` feeds `Backdraw|4|1`, which feeds `Main|4|1` — so the second is two steps
 * downstream of the first, which is what lets one draw show both halves of the rule and show that
 * FED is followed all the way down.
 */

const STATUSES = [DEAD_RUBBER, CANCELLED, ABANDONED].map((matchUpStatus) => ({ matchUpStatus }));
const DRAW_ID = 'never-to-be-played';

const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps ?? [];
const at = (structureName: string, roundNumber: number) =>
  matchUps().find((matchUp) => matchUp.structureName === structureName && matchUp.roundNumber === roundNumber);

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
  const cell = MATRIX_CELLS.find(({ seed }) => seed === 77);
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

// CONTROL: the stalls are there, and the chain between them is what the docblock says it is
it('has two stalls in one chain before anything is declared', () => {
  play();
  expect(stalledAt()).toEqual(['Backdraw|3|1', 'Main|4|1']);

  const upstream = at('Backdraw', 3);
  const between = matchUps().find((matchUp) => matchUp.matchUpId === upstream.winnerMatchUpId);
  expect(between.structureName).toEqual('Backdraw');
  expect(between.winnerMatchUpId).toEqual(at('Main', 4).matchUpId);
});

it.each(STATUSES)('$matchUpStatus silences the stall in the matchUp that carries it', ({ matchUpStatus }) => {
  play();
  setStatus(at('Main', 4), matchUpStatus);

  // and ONLY that one: the stall upstream of it is fed by nothing that was declared
  expect(stalledAt()).toEqual(['Backdraw|3|1']);
});

it.each(STATUSES)('$matchUpStatus silences every stall in what the matchUp feeds', ({ matchUpStatus }) => {
  play();
  setStatus(at('Backdraw', 3), matchUpStatus);

  expect(stalledAt()).toEqual([]);
});
