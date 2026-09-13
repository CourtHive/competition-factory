import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * `DOUBLE_DEFAULT` must take the same propagation branches as `DOUBLE_WALKOVER`.
 *
 * Three sites asked "is this a double exit" by testing `=== DOUBLE_WALKOVER`, so a `DOUBLE_DEFAULT`
 * took the false branch at each. Measured over the 600-seed sweep window before the fix:
 * `noDownstreamDependencies` 1303 times, `hasPropagatedExitDownstream` 161,
 * `doubleExitAdvancement` 14 — the last while assigning to a variable named
 * `loserMatchUpIsDoubleExit`. `noDownstreamDependencies` contradicted itself outright: the line
 * above the defect already asked the same question with `[DOUBLE_WALKOVER, DOUBLE_DEFAULT]`.
 *
 * Both cases below mix the two statuses and are shrunk reproductions from that window. Each ends by
 * re-scoring to the OTHER double exit, which is what forces the two to be one class.
 *
 * NOTE: `doubleExitStatusParity` cannot police this. It renames `DOUBLE_DEFAULT` to
 * `DOUBLE_WALKOVER` and `DEFAULTED` to `WALKOVER` before comparing its two runs, so a defect that
 * forces exactly that convergence is invisible to it. A green parity suite is not evidence here,
 * which is why these assertions are on the engine's own refusals.
 */

const DRAW_ID = 'double-exit-predicate-parity';

function target({ structureName, roundNumber, roundPosition }: any) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );
}

it.each([
  {
    scenario: 'a consolation DOUBLE_DEFAULT then main DOUBLE_WALKOVERs in a FEED_IN_CHAMPIONSHIP',
    drawType: FEED_IN_CHAMPIONSHIP,
    participantsCount: 8,
    drawSize: 8,
    propagateExitStatus: true,
    seed: 9000464,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
      {
        structureName: 'Consolation',
        roundNumber: 1,
        roundPosition: 1,
        outcome: { matchUpStatus: DOUBLE_DEFAULT },
      },
      // A natively-recorded double exit with two real participants now blocks an upstream unwind —
      // it is a genuine result, and `isActiveDownstream` was blind to it because a double exit
      // carries no `winningSide`. Cleared first here, as a director would, so the predicate parity
      // this file is about is still what the remaining steps exercise.
      {
        structureName: 'Consolation',
        roundNumber: 1,
        roundPosition: 1,
        outcome: {
          score: { scoreStringSide1: '', scoreStringSide2: '' },
          matchUpStatus: TO_BE_PLAYED,
          winningSide: undefined,
        },
      },
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  },
  {
    scenario: 'a DOUBLE_DEFAULT re-scored to DOUBLE_WALKOVER beside one in a FIRST_MATCH_LOSER_CONSOLATION',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    participantsCount: 31,
    drawSize: 32,
    propagateExitStatus: false,
    seed: 9000521,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 15, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 16, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 16, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  },
])('$scenario propagates without refusing mid-cascade', (testCase) => {
  const { participantsCount, propagateExitStatus, drawType, drawSize, seed, steps } = testCase;

  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId: DRAW_ID }],
    nonRandom: seed,
    setState: true,
  });

  for (const [index, step] of steps.entries()) {
    const matchUp = target(step);
    expect(matchUp?.matchUpId, `step ${index + 1} target missing`).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId: DRAW_ID,
    });
    expect(
      result.error,
      `step ${index + 1} (${step.structureName} r${step.roundNumber}p${step.roundPosition})`,
    ).toBeUndefined();
  }

  // CONTROL, not the regression assertion: the committed oracle must stay clean so the fix cannot
  // buy the refusal back with a worse draw. Both scenarios are clean on it before the fix too.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((inconsistencies?.inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});
