import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * SCORING A LINE OF A DUAL THAT HOLDS A DOUBLE EXIT UNWINDS THE DOUBLE EXIT.
 *
 * ## The defect it was written against
 *
 * Found 2026-10-01 while building the TEAM arm of the exit-propagation matrix (assessment G2). A dual
 * holding DOUBLE_WALKOVER has propagated: its winner target carries a produced exit, and a team already
 * waiting there has been awarded the walkover and advanced. Scoring one of the dual's tieMatchUps
 * turns the dual IN_PROGRESS and, when enough lines are decided, COMPLETED with a winner — but the
 * dual's status is written by `updateTieMatchUpScore` directly, so the unwind a direct re-score of the
 * dual goes through never ran. Measured, with dual `1|1` completed through its lines FIRST:
 *
 *     1|2  DOUBLE_WALKOVER          2|1  WALKOVER ws=1  [A, -]      3|1  [A]        correct
 *     1|2's lines scored, COMPLETED  2|1  WALKOVER ws=2  [A, B]      3|1  [A, B]     B TOOK a walkover
 *                                                                                  nobody withdrew
 *
 * Both teams in the final. With `1|2`'s lines scored before anyone reached `2|1` the arrival resolved
 * benignly, which is why the dual-level cells never saw it: the ORDER exposes the missing unwind.
 *
 * ## Why the order is part of the test
 *
 * The control plays the lines in the benign order and asserts the same end state, so the test says
 * the end state is route-independent rather than merely "not the corrupt shape".
 */

// DOMINANT_DUO plays its doubles as one eight-game set (SET1-S:8/TB7) and its singles best of three
const played = (line: any) => ({
  score: {
    sets: line.matchUpFormat?.startsWith('SET1-S:8')
      ? [{ side1Score: 8, side2Score: 3, winningSide: 1 }]
      : [
          { side1Score: 6, side2Score: 3, winningSide: 1 },
          { side1Score: 6, side2Score: 3, winningSide: 1 },
        ],
  },
  winningSide: 1,
});

const all = (drawId: string): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
const dual = (drawId: string, roundNumber: number, roundPosition: number) =>
  all(drawId).find((m) => !m.collectionId && m.roundNumber === roundNumber && m.roundPosition === roundPosition);
const teams = (matchUp: any) => (matchUp.sides ?? []).map((side: any) => side.participantId).filter(Boolean);

function scoreLines(drawId: string, dualMatchUp: any, count: number) {
  const lines = all(drawId).filter((m) => m.matchUpTieId === dualMatchUp.matchUpId && !m.winningSide);
  for (const line of lines.slice(0, count)) {
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId, outcome: played(line) });
    expect(result.success).toEqual(true);
  }
}

function generate(drawId: string) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: 300001,
    setState: true,
  });
  const lineUps: any = tournamentEngine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true });
  expect(lineUps.success).toEqual(true);
}

it('unwinds the produced walkover when the first line of a double-walkover dual is scored', () => {
  const drawId = 'dual-dw-lines';
  generate(drawId);

  // the neighbouring dual completes first, so its winner is already waiting in 2|1
  scoreLines(drawId, dual(drawId, 1, 1), 2);
  const [teamA] = teams(dual(drawId, 2, 1));
  expect(teamA).toBeDefined();

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: dual(drawId, 1, 2).matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // CONTROL: the arrangement under test — the double exit produced a walkover for team A, advanced
  expect(dual(drawId, 2, 1).matchUpStatus).toEqual(WALKOVER);
  expect(dual(drawId, 2, 1).winningSide).toEqual(1);
  expect(teams(dual(drawId, 3, 1))).toEqual([teamA]);

  // THE DEFECT: scoring a line left the walkover standing; team B then arrived into it and took it
  scoreLines(drawId, dual(drawId, 1, 2), 1);
  expect(dual(drawId, 2, 1).matchUpStatus, 'the produced walkover is withdrawn').toEqual(TO_BE_PLAYED);
  expect(dual(drawId, 2, 1).winningSide).toBeUndefined();
  expect(teams(dual(drawId, 3, 1)), 'and team A is taken back out of the final').toEqual([]);

  scoreLines(drawId, dual(drawId, 1, 2), 1);
  expect(dual(drawId, 1, 2).matchUpStatus).toEqual(COMPLETED);
  const [teamB] = teams(dual(drawId, 1, 2));
  expect(dual(drawId, 2, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(teams(dual(drawId, 2, 1)).sort((a, b) => a.localeCompare(b))).toEqual(
    [teamA, teamB].sort((a, b) => a.localeCompare(b)),
  );
  expect(teams(dual(drawId, 3, 1))).toEqual([]);

  // THE INVARIANT: the benign order — lines scored before anyone reached 2|1 — ends the same way
  const control = 'dual-dw-lines-control';
  generate(control);
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: dual(control, 1, 2).matchUpId,
    drawId: control,
  });
  expect(result.success).toEqual(true);
  scoreLines(control, dual(control, 1, 2), 2);
  scoreLines(control, dual(control, 1, 1), 2);
  expect(dual(control, 2, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(teams(dual(control, 2, 1))).toHaveLength(2);
  expect(teams(dual(control, 3, 1))).toEqual([]);
});

/**
 * AND WHEN THE PRODUCED RESULT HAS BEEN PLAYED ON, THE LINE IS REFUSED — as the dual's own re-score is.
 *
 * Measured 2026-10-01 before the refusal existed: with the final COMPLETED 2-0 on the walkover
 * winner, scoring a line of the double-walkover dual was accepted, and the unwind reset the played
 * final to TO_BE_PLAYED with one team left in it. `CANNOT_CHANGE_OUTCOME` is what a direct re-score
 * of the dual receives in this state (`winningSideWithDownstreamDependencies`); the line gets the same.
 */
it('refuses a line of a double-walkover dual once its produced walkover has been played on', () => {
  const drawId = 'dual-dw-active';
  generate(drawId);

  scoreLines(drawId, dual(drawId, 1, 1), 2);
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: dual(drawId, 1, 2).matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  // the other half plays through and the walkover winner plays — and wins — the final
  scoreLines(drawId, dual(drawId, 1, 3), 2);
  scoreLines(drawId, dual(drawId, 1, 4), 2);
  scoreLines(drawId, dual(drawId, 2, 2), 2);
  scoreLines(drawId, dual(drawId, 3, 1), 2);

  // CONTROL: the arrangement under test
  const finalBefore = dual(drawId, 3, 1);
  expect(finalBefore.matchUpStatus).toEqual(COMPLETED);
  expect(dual(drawId, 2, 1).matchUpStatus).toEqual(WALKOVER);

  const [line] = all(drawId).filter((m) => m.matchUpTieId === dual(drawId, 1, 2).matchUpId);
  result = tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId, outcome: played(line) });
  expect(result.error?.code).toEqual('ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME');

  // nothing was written: the dual, the walkover and the played final all stand
  expect(dual(drawId, 1, 2).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(dual(drawId, 2, 1).matchUpStatus).toEqual(WALKOVER);
  const finalAfter = dual(drawId, 3, 1);
  expect(finalAfter.matchUpStatus).toEqual(COMPLETED);
  expect(finalAfter.winningSide).toEqual(finalBefore.winningSide);
  expect(teams(finalAfter)).toEqual(teams(finalBefore));
  expect(tournamentEngine.getDrawInconsistencies({ drawId })?.inconsistencies ?? []).toEqual([]);
});
