import { overlap } from '@Tools/arrays';

import { BYE, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

export function includesMatchUpStatuses({
  matchUpStatuses = [BYE, WALKOVER, DEFAULTED],
  drawPositionMatchUps,
  loserDrawPosition,
  sourceMatchUps,
}) {
  const sourceMatchUp = drawPositionMatchUps?.reduce(
    (sourceMatchUp, matchUp) =>
      !sourceMatchUp || matchUp.roundNumber > sourceMatchUp.roundNumber ? matchUp : sourceMatchUp,
    undefined,
  );
  const winnerDrawPosition = sourceMatchUp?.drawPositions?.find((drawPosition) => drawPosition !== loserDrawPosition);

  const winnerMatchUpStatuses = sourceMatchUps
    .filter((matchUp) => matchUp?.drawPositions?.includes(winnerDrawPosition))
    .map((matchUp) => matchUp.matchUpStatus);

  const loserMatchUpStatuses = sourceMatchUps
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
