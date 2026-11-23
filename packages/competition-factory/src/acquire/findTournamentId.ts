import { getEventIdsAndDrawIds } from '@Query/tournaments/getEventIdsAndDrawIds';

// types
import { TournamentRecords } from '@Types/factoryTypes';

type FindTournamentIdArgs = {
  tournamentRecords: TournamentRecords;
  eventId?: string;
  drawId?: string;
};
export function findTournamentId({ tournamentRecords, eventId, drawId }: FindTournamentIdArgs): string | undefined {
  const { tournamentIdMap } = getEventIdsAndDrawIds({ tournamentRecords });
  const tournamentIds: string[] = tournamentIdMap ? Object.keys(tournamentIdMap) : [];
  return tournamentIds.find(
    (tournamentId) =>
      (eventId && tournamentIdMap?.[tournamentId].includes(eventId)) ||
      (drawId && tournamentIdMap?.[tournamentId].includes(drawId)),
  );
}
