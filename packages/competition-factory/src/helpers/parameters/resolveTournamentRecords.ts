import { TournamentRecords } from '@Types/factoryTypes';

export function resolveTournamentRecords(params?): TournamentRecords {
  return (
    params?.tournamentRecords ??
    (params?.tournamentRecord && {
      [params.tournamentRecord.tournamentId]: params.tournamentRecord,
    }) ??
    {}
  );
}
