import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  FIRST_ROUND_LOSER_CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Entering the same two double exits in either order must produce the same record.
 *
 * `doubleExitAdvancement` derived the converged status from the ARRIVING source alone — at
 * `handleEmptyExitLoser` and at `conditionallyAdvanceDrawPosition` — so the stored `matchUpStatus`
 * was a function of tournament state PLUS the order the operator entered the two results. Measured
 * before the fix across 8 draw-type/size combinations x 4 status pairs: **28 of 32 differed**. A
 * director entering the same two walkovers in the other order got a different record.
 *
 * Both sites now derive it with `collapseDoubleExitStatus` from BOTH origins, the second of which is
 * the exit the first arrival already produced on the target.
 *
 * WHAT THIS ASSERTS, and what it deliberately does not:
 *
 *  - ASSERTED: the converged `matchUpStatus` and `winningSide`, across every structure the pair
 *    touches. This is what the fix addresses and what a tournament director sees.
 *  - NOT ASSERTED: the per-side record. Measured on the consolation convergence path, the native
 *    `sideExitProvenance` is correct in both orders but SINGLE-SIDED — and which side it holds
 *    depends on entry order — while the legacy `matchUpStatusCodes` array is both order-dependent
 *    and self-inconsistent there, one order storing
 *    `{ matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_WALKOVER }`: a walkover origin
 *    producing a default. Asserting either would pin a defect. Completing the per-side record means
 *    fixing the WRITER to record both origins, which is the `matchUpStatusCodes`-becomes-a-
 *    projection work in MATCHUP_STATUS_CODES_PER_SIDE.md.
 *
 * Generated ids are excluded: each run builds a fresh tournament, so any id differs by construction.
 * An earlier version of this measurement compared `sourceMatchUpId` and reported 32 of 32 differing
 * — including uniform pairs, which cannot differ by flavour — and that impossible result is how the
 * flaw in the measurement surfaced.
 */

function playInOrder({ drawType, drawSize, statuses, order }: any) {
  const drawId = `order-${drawType}-${drawSize}-${statuses.join('')}-${order.join('')}`;
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType, participantsCount: drawSize }],
    nonRandom: 1,
    setState: true,
  });

  const roundOne = () =>
    tournamentEngine
      .allDrawMatchUps({ inContext: true, drawId })
      .matchUps.filter((matchUp: any) => matchUp.roundNumber === 1 && matchUp.stage === 'MAIN')
      .sort((a: any, b: any) => a.roundPosition - b.roundPosition);

  for (const index of order) {
    const target = roundOne().find((matchUp: any) => matchUp.roundPosition === index + 1);
    expect(target?.matchUpId).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: statuses[index] },
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }

  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.filter((matchUp: any) => matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED')
    .map(
      (matchUp: any) =>
        `${matchUp.structureName}|r${matchUp.roundNumber}p${matchUp.roundPosition}|${matchUp.matchUpStatus}|ws=${matchUp.winningSide}`,
    )
    .sort();
}

it.each([
  { drawType: SINGLE_ELIMINATION, drawSize: 8 },
  { drawType: SINGLE_ELIMINATION, drawSize: 16 },
  { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 },
  { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 16 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 },
  { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8 },
  { drawType: DOUBLE_ELIMINATION, drawSize: 8 },
  { drawType: COMPASS, drawSize: 8 },
])('$drawType of $drawSize records two double exits the same way in either order', ({ drawType, drawSize }) => {
  // uniform pairs and both mixed orderings; the mixed pair is where the flavour collapse matters
  for (const statuses of [
    [DOUBLE_WALKOVER, DOUBLE_WALKOVER],
    [DOUBLE_DEFAULT, DOUBLE_DEFAULT],
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT],
    [DOUBLE_DEFAULT, DOUBLE_WALKOVER],
  ]) {
    const forward = playInOrder({ drawType, drawSize, statuses, order: [0, 1] });
    const reversed = playInOrder({ drawType, drawSize, statuses, order: [1, 0] });

    // the control: the pair must actually have produced propagated state, or this passes vacuously
    expect(forward.length, `${statuses.join('+')} produced no decided matchUps`).toBeGreaterThan(0);
    expect(reversed, `${drawType}/${drawSize} ${statuses.join('+')} depends on entry order`).toEqual(forward);
  }
});
