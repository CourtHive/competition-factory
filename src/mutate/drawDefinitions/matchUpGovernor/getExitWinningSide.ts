export function getExitWinningSide({ inContextDrawMatchUps, drawPosition, matchUpId }) {
  // determine which sideNumber { drawPosition } will be and assign winningSide
  // NOTE: at present this is dependent on presence of .winnerMatchUpId and .loserMatchUpId

  const sourceMatchUps = inContextDrawMatchUps
    .filter(({ winnerMatchUpId, loserMatchUpId }) => loserMatchUpId === matchUpId || winnerMatchUpId === matchUpId)
    // sourceMatchUps MUST be sorted by roundPosition
    .sort((a, b) => a.roundPosition - b.roundPosition);

  const matchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

  // A BYE draw position can never be the winning side. Callers currently strip
  // BYE positions before calling, so this guard is a no-op for them today — it
  // exists so a future caller that forgets to filter cannot resurrect the
  // "advance the empty/BYE side" bug class (see the progressExitStatus
  // single-participant fix).
  const targetSide = matchUp?.sides?.find((side) => side.drawPosition === drawPosition);
  if (targetSide?.bye) return undefined;

  const feedRound = matchUp.feedRound;

  return feedRound
    ? 1
    : sourceMatchUps.reduce((sideNumber, sourceMatchUp, index) => {
        if (sourceMatchUp.drawPositions?.includes(drawPosition)) return index + 1;
        return sideNumber;
      }, undefined);
}
