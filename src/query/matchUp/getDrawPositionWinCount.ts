import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';

// constants and types
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

// Counts the REAL (scored) wins a drawPosition has accrued across a structure's matchUps. BYEs and
// WALKOVERs are not wins, nor is a DEFAULTED carrying no score component. This is the exact predicate
// directLoser uses to decide FIRST_MATCH_LOSER_CONSOLATION eligibility (a genuine first-match loser
// has zero prior wins), extracted so the read-only integrity check reuses identical logic rather than
// re-inferring feed eligibility from link presence.
/**
 * Whether an outcome is one that does NOT count as a win.
 *
 * A WALKOVER is never a win; a DEFAULTED is a win only when it carries a score. Exported so that
 * anything asking "would this change feed eligibility?" tests the SAME condition the count applies,
 * rather than restating it. A guard that restates this rule and drifts from it is worse than none —
 * measured 2026-09-14, when a restated version read the incoming REQUEST while this reads the
 * resulting RECORD, and the two disagreed about the identical operation.
 */
export function isUnscoredOutcome({ matchUpStatus, score }: { matchUpStatus?: string; score?: any }): boolean {
  if (matchUpStatus === WALKOVER) return true;
  return matchUpStatus === DEFAULTED && !checkScoreHasValue({ score });
}

export function getDrawPositionWinCount({
  sourceMatchUps,
  drawPosition,
}: {
  sourceMatchUps: HydratedMatchUp[];
  drawPosition: number;
}): number {
  return sourceMatchUps
    .filter((matchUp) => matchUp.drawPositions?.includes(drawPosition))
    .filter((matchUp) => {
      const drawPositionSide = matchUp.sides?.find((side) => side.drawPosition === drawPosition);
      const unscoredOutcome = isUnscoredOutcome({ matchUpStatus: matchUp.matchUpStatus, score: matchUp.score });
      return drawPositionSide?.sideNumber === matchUp.winningSide && !unscoredOutcome;
    }).length;
}
