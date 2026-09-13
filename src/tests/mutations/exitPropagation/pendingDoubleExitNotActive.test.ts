import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_ELIMINATION, OLYMPIC } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A double exit with an unfilled side must not mark its drawPositions ACTIVE.
 *
 * Nothing can have won a double exit — it carries no `winningSide` — so while either side is still
 * empty the matchUp is PENDING and its feeding drawPositions must stay available for the arrival it
 * is waiting for. `activeMatchUpStatuses` contains `DOUBLE_WALKOVER` and `DOUBLE_DEFAULT`, and
 * `isActiveMatchUp`'s exclusion list omitted both, so such a matchUp read ACTIVE purely from its
 * status. `getStructureDrawPositionProfiles` then marked its drawPositions active and the cascade
 * refused the arrival with ERR_ACTIVE_DRAW_POSITION — after it had already mutated the draw.
 *
 * That is the failure `isActiveMatchUp`'s own comment was written to prevent; the existing
 * `winnerAssigned` guard only covers the single-exit shape, where a `winningSide` points at an
 * empty slot. A double exit has no `winningSide` for that guard to inspect.
 *
 * All three cases are shrunk reproductions from the 600-seed sweep window (`SEED_START=9000001`),
 * which is why the seeds are the sweep's own. They span three draw types deliberately: the refusal
 * reaches the same predicate through different link topologies.
 *
 * A fourth seed (9000315) that this change closes in the census is deliberately NOT here. Its
 * SHRUNK reproduction exhibits a different defect — a mutual recursion between `removeDoubleExit`
 * and `conditionallyRemoveDrawPosition` that throws, present on master before this change — so it
 * would not be testing this fix. The shrinker preserves only the PROPERTY, not the mechanism.
 */

const DRAW_ID = 'pending-double-exit';

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
    scenario: 'a DOUBLE_DEFAULT re-score of a propagated WALKOVER in a DOUBLE_ELIMINATION',
    drawType: DOUBLE_ELIMINATION,
    participantsCount: 27,
    drawSize: 32,
    propagateExitStatus: true,
    seed: 9000068,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 1,
        outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 15,
        outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
    ],
  },
  {
    scenario: 'a DOUBLE_DEFAULT re-score of a propagated WALKOVER in a DOUBLE_ELIMINATION of 32',
    drawType: DOUBLE_ELIMINATION,
    participantsCount: 27,
    drawSize: 32,
    propagateExitStatus: true,
    seed: 9000068,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 1,
        outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 15,
        outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
    ],
  },
  {
    scenario: 'a double exit re-scored to the other double exit in an OLYMPIC',
    drawType: OLYMPIC,
    participantsCount: 7,
    drawSize: 8,
    propagateExitStatus: false,
    seed: 9000480,
    steps: [
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 3,
        outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
      },
      { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'East', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
    ],
  },
])('$scenario is not refused by a pending double exit reading as active', (testCase) => {
  const { participantsCount, propagateExitStatus, drawType, drawSize, seed, steps } = testCase;

  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId: DRAW_ID }],
    nonRandom: seed,
    setState: true,
  });
  // `propagateExitStatus` is passed PER CALL, exactly as the sweep's observeMutation does, and no
  // scoring policy is attached. Attaching one changes behaviour: with a policy attached, seed
  // 9000315 instead reaches a mutual recursion between removeDoubleExit and
  // conditionallyRemoveDrawPosition that throws — a different defect, recorded separately.

  for (const [index, step] of steps.entries()) {
    const matchUp = target(step);
    expect(matchUp?.matchUpId, `step ${index + 1} target missing`).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId: DRAW_ID,
    });
    // every step is asserted, so a future setup change cannot turn this into a vacuous pass
    expect(
      result.error,
      `step ${index + 1} (${step.structureName} r${step.roundNumber}p${step.roundPosition})`,
    ).toBeUndefined();
  }

  // CONTROL, not the regression assertion: the committed oracle must stay clean, so the fix cannot
  // buy the refusal back by leaving the draw in a worse shape. These scenarios are clean on this
  // oracle before the fix too — the falsifying assertion is the loop above.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((inconsistencies?.inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});
