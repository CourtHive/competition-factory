import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

import { isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';

import { BYE, DEFAULTED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';

/**
 * A consolation reservation that is PLACED must also be WITHDRAWN.
 *
 * `propagateConsolationBye` reserves a consolation slot with a BYE once every feeding first-round
 * matchUp is decided: whoever loses the next round will carry a prior win, a FIRST_MATCHUP link will
 * not carry them, and the slot can never fill. Correct when placed — and never revisited.
 *
 * Correcting one of those first-round results to a WALKOVER removes the prior win. The prospective
 * loser is eligible again and the reservation is stale.
 *
 * This is the ONLY confluence defect in the engine that does not involve a double exit: a sweep of
 * six correction shapes across eight draw types found 4 divergences in 576 cells, all of them this.
 *
 * ## Two halves, and the second is the reason the first is enough
 *
 * The withdrawal runs on the winner-advancement path, so it reaches a correction only while the
 * consolation is UNPLAYED. That is not a gap. Once a consolation result exists, the correction is
 * REFUSED outright — *"changes that percolate to the backdraw where the start has occurred should
 * not be allowed"*, CA 2026-09-22 — so no stale reservation is ever created to withdraw.
 *
 * Both halves are asserted here. An earlier reading of this had the fix "going blind once the
 * consolation is played"; it was measuring a REFUSED correction and reporting the unchanged draw as
 * a divergence.
 */

const drawId = 'A';
/** a part-set score — legitimate only for an outcome abandoned mid-match, and enough for
 * `checkScoreHasValue`, which is what makes a DEFAULTED count as a win */
const PART_SCORE = { sets: [{ side1Score: 6, side2Score: 3 }] };
/** a complete result — an incomplete score is refused with ERR_INVALID_SCORE for a played win */
const completedWin = () =>
  mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome;

/** `3P` = participant, `1B` = bye, `2-` = empty — the shape a divergence shows up in */
function renderAssignment(assignment: any): string {
  if (assignment.bye) return `${assignment.drawPosition}B`;
  if (assignment.participantId) return `${assignment.drawPosition}P`;
  return `${assignment.drawPosition}-`;
}
const setup = () => {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 8, drawId }],
    nonRandom: 9000230,
  });
  tournamentEngine.setState(tournamentRecord);
  const find = (structureName: string, roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find(
        (m: any) =>
          m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
  const put = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: find(structureName, roundNumber, roundPosition).matchUpId,
      drawId,
      outcome,
    });
  const consolationAssignments = () => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures
      .flatMap((s: any) => s.structures ?? [s])
      .find((s: any) => s.structureName === 'Consolation');
    return structure?.positionAssignments ?? [];
  };
  return { find, put, consolationAssignments };
};

it('withdraws the consolation reservation when the result that justified it is corrected', () => {
  const { find, put, consolationAssignments } = setup();

  expect(put('Main', 1, 1, { winningSide: 1 }).success).toEqual(true);
  expect(put('Main', 1, 2, { winningSide: 1 }).success).toEqual(true);

  // both feeders decided, so the next round's loser will carry a prior win: the slot is reserved
  expect(consolationAssignments().find((a: any) => a.drawPosition === 1)?.bye).toEqual(true);
  expect(find('Consolation', 2, 1).matchUpStatus).toEqual(BYE);

  // correcting to a WALKOVER removes that prior win — the reservation no longer has a premise
  expect(put('Main', 1, 1, { matchUpStatus: WALKOVER, winningSide: 2 }).success).toEqual(true);

  expect(consolationAssignments().find((a: any) => a.drawPosition === 1)?.bye).toBeUndefined();
  expect(find('Consolation', 2, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
});

it('reaches the same state as entering the outcomes directly', () => {
  const direct = setup();
  direct.put('Main', 1, 1, { matchUpStatus: WALKOVER, winningSide: 2 });
  direct.put('Main', 1, 2, { winningSide: 1 });
  const directAssignments = direct.consolationAssignments().map(renderAssignment);
  const directStatus = direct.find('Consolation', 2, 1).matchUpStatus;

  const corrected = setup();
  corrected.put('Main', 1, 1, { winningSide: 1 });
  corrected.put('Main', 1, 2, { winningSide: 1 });
  corrected.put('Main', 1, 1, { matchUpStatus: WALKOVER, winningSide: 2 });
  const correctedAssignments = corrected.consolationAssignments().map(renderAssignment);

  // how you got here must not change where you are
  expect(correctedAssignments).toEqual(directAssignments);
  expect(corrected.find('Consolation', 2, 1).matchUpStatus).toEqual(directStatus);
  expect(directStatus).toEqual(TO_BE_PLAYED);
});

it('THE OTHER HALF: once the consolation has started, the correction is refused outright', () => {
  const { put } = setup();

  put('Main', 1, 1, { winningSide: 1 });
  put('Main', 1, 2, { winningSide: 1 });

  // Consolation|1|1 holds both first-round losers; scoring it STARTS the backdraw
  expect(put('Consolation', 1, 1, { winningSide: 1 }).success).toEqual(true);

  // a main-draw change may not percolate into a backdraw that has started — so there is never a
  // stale reservation for the withdrawal above to miss
  const result: any = put('Main', 1, 1, { matchUpStatus: WALKOVER, winningSide: 2 });
  expect(result.success).toBeUndefined();
  expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
});

/**
 * THE PLACEMENT SIDE OF THE SAME RULE.
 *
 * The reservation asks "will the round-2 loser carry a prior win?" — and the authority for that is
 * `getDrawPositionWinCount` / `isUnscoredOutcome`, the predicate `directLoser` uses to decide the
 * very eligibility being predicted. `propagateConsolationBye` restated it as
 * `[COMPLETED, RETIRED].includes(matchUpStatus)` and drifted: a **scored `DEFAULTED`** is a win to
 * the authority but was absent from the list, so the reservation was placed LATE — `Consolation|2|1`
 * read `TO_BE_PLAYED` until the round-2 result arrived and `directLoser` placed the BYE on the
 * authority's terms. End states converged, which is why the 576-cell confluence sweep read clean;
 * the divergence lived in the window between the two results, where a director reads the backdraw.
 *
 * These cases are asserted against `isUnscoredOutcome` rather than against a status list, so this
 * test cannot itself become a third restatement of the rule.
 */
const firstRoundOutcomes = [
  { label: 'a completed win', build: completedWin },
  { label: 'a retirement', build: () => ({ winningSide: 1, matchUpStatus: RETIRED, score: PART_SCORE }) },
  { label: 'a scored default', build: () => ({ winningSide: 1, matchUpStatus: DEFAULTED, score: PART_SCORE }) },
  { label: 'an unscored default', build: () => ({ winningSide: 1, matchUpStatus: DEFAULTED }) },
  { label: 'a walkover', build: () => ({ winningSide: 1, matchUpStatus: WALKOVER }) },
];

it.each(firstRoundOutcomes)('reserves the consolation slot for $label exactly when it is a win', ({ build }) => {
  const { find, put, consolationAssignments } = setup();
  const outcome = build();

  expect(put('Main', 1, 1, outcome).success).toEqual(true);
  expect(put('Main', 1, 2, outcome).success).toEqual(true);

  // what the AUTHORITY says about the stored record — not about the outcome we asked for
  const stored = find('Main', 1, 1);
  const isAWin =
    !!stored.winningSide && !isUnscoredOutcome({ matchUpStatus: stored.matchUpStatus, score: stored.score });

  const reserved = !!consolationAssignments().find((a: any) => a.drawPosition === 1)?.bye;
  expect(reserved).toEqual(isAWin);
  expect(find('Consolation', 2, 1).matchUpStatus).toEqual(isAWin ? BYE : TO_BE_PLAYED);
});

it('a scored default reserves the slot at the same moment a completed win does', () => {
  const byStatus = (outcome: any) => {
    const { find, put } = setup();
    put('Main', 1, 1, outcome);
    put('Main', 1, 2, outcome);
    return find('Consolation', 2, 1).matchUpStatus;
  };

  // the defect: DEFAULTED-with-score read TO_BE_PLAYED here while COMPLETED read BYE
  expect(byStatus({ winningSide: 1, matchUpStatus: DEFAULTED, score: PART_SCORE })).toEqual(byStatus(completedWin()));
  expect(byStatus(completedWin())).toEqual(BYE);
});
