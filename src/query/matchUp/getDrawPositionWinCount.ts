import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';

// constants and types
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

// Counts the REAL (scored) wins a drawPosition has accrued across a structure's matchUps. BYEs and
// WALKOVERs are not wins, nor is a DEFAULTED carrying no score component. This is the exact predicate
// directLoser uses to decide FIRST_MATCH_LOSER_CONSOLATION eligibility (a genuine first-match loser
// has zero prior wins), extracted so the read-only integrity check reuses identical logic rather than
// re-inferring feed eligibility from link presence.
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
      const unscoredOutcome =
        matchUp.matchUpStatus === WALKOVER || (matchUp.matchUpStatus === DEFAULTED && !checkScoreHasValue(matchUp));
      return drawPositionSide?.sideNumber === matchUp.winningSide && !unscoredOutcome;
    }).length;
}
