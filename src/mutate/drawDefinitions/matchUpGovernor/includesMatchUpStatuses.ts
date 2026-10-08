import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { overlap } from '@Tools/arrays';

// constants
import { BYE, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

export function includesMatchUpStatuses({
  matchUpStatuses = [BYE, WALKOVER, DEFAULTED],
  drawPositionMatchUps,
  loserDrawPosition,
  sourceMatchUps,
}) {
  // Only TEAM-level matchUps. In context a TEAM matchUp's tieMatchUps carry its drawPositions, so a rubber's WALKOVER
  // read as the team's: clearing a round 2 result whose winner took its round 1 dual with a walkover rubber removed
  // the FIRST_MATCH_LOSER_CONSOLATION BYE reserved for that slot.
  const dualMatchUps = teamLevelMatchUps(drawPositionMatchUps);
  const structureMatchUps = teamLevelMatchUps(sourceMatchUps);

  const sourceMatchUp = dualMatchUps.reduce(
    (sourceMatchUp, matchUp) =>
      !sourceMatchUp || matchUp.roundNumber > sourceMatchUp.roundNumber ? matchUp : sourceMatchUp,
    undefined,
  );
  const winnerDrawPosition = sourceMatchUp?.drawPositions?.find((drawPosition) => drawPosition !== loserDrawPosition);

  const winnerMatchUpStatuses = structureMatchUps
    .filter((matchUp) => matchUp?.drawPositions?.includes(winnerDrawPosition))
    .map((matchUp) => matchUp.matchUpStatus);

  const loserMatchUpStatuses = structureMatchUps
    .filter((matchUp) => matchUp?.drawPositions?.includes(loserDrawPosition))
    .map((matchUp) => matchUp.matchUpStatus);

  const winnerHadMatchUpStatus = overlap(winnerMatchUpStatuses ?? [], matchUpStatuses);

  const loserHadMatchUpStatus = overlap(loserMatchUpStatuses ?? [], matchUpStatuses);

  return {
    sourceMatchUp,
    winnerHadMatchUpStatus,
    winnerMatchUpStatuses,
    loserHadMatchUpStatus,
    loserMatchUpStatuses,
  };
}
