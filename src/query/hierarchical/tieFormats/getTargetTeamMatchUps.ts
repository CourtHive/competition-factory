import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';

// constants and types
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { MatchUp } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/matchUpTypes';

export function getTargetTeamMatchUps({
  updateInProgressMatchUps,
  drawDefinition,
  structureId,
  structure,
  matchUpId,
  matchUp,
}) {
  let matchUps: MatchUp[] = [];
  if (matchUpId && matchUp) {
    matchUps = [matchUp];
  } else if (structureId && structure) {
    matchUps =
      getAllStructureMatchUps({
        matchUpFilters: { matchUpTypes: [TEAM] },
        structure,
      })?.matchUps ?? [];
  } else if (drawDefinition) {
    matchUps =
      allDrawMatchUps({
        matchUpFilters: { matchUpTypes: [TEAM] },
        drawDefinition,
      })?.matchUps ?? [];
  }

  // all team matchUps in scope which are completed or which have a tieFormat should not be modified
  const targetMatchUps = matchUps.filter(
    (matchUp) =>
      !matchUp.winningSide &&
      matchUp.matchUpStatus !== COMPLETED &&
      (updateInProgressMatchUps || (matchUp.matchUpStatus !== IN_PROGRESS && !checkScoreHasValue(matchUp))),
  );

  return { targetMatchUps };
}
