export function isValidTournamentRecord(tournamentRecord) {
  const { tournamentId } = tournamentRecord ?? {};
  return !!tournamentId;
}
