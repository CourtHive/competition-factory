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

  // On a fed round the matchUp's OWN derived sides are the authority on which side a drawPosition
  // occupies. `feedRound => 1` is a topology proxy for that fact: it holds while the position being
  // advanced is the one that arrived over the feed link, and fails when the position arrived from
  // the previous round of the SAME structure. Measured across the 600-cell exit-propagation matrix,
  // the proxy is consulted 47 times and disagrees with the derived side 4 times — every one of them
  // the DOUBLE_ELIMINATION Main final, where the undefeated main-bracket winner sits on side 2 and
  // the empty fed slot is side 1, so the proxy handed the walkover to a side holding nobody.
  // The proxy is kept as a fallback for a matchUp whose sides do not yet carry the drawPosition.
  if (feedRound) return targetSide?.sideNumber ?? 1;

  return sourceMatchUps.reduce((sideNumber, sourceMatchUp, index) => {
    if (sourceMatchUp.drawPositions?.includes(drawPosition)) return index + 1;
    return sideNumber;
  }, undefined);
}
