export function getMatchUp({ matchUps, matchUpId }) {
  const matchUp = (matchUps ?? []).find((matchUp) => matchUp.matchUpId === matchUpId);

  return { matchUp };
}
