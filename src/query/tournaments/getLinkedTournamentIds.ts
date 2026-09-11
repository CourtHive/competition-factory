import { getRecordLinkedTournamentIds } from '@Acquire/getRecordLinkedTournamentIds';

// constants and types
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';

export function getLinkedTournamentIds({
  tournamentRecords,
}: {
  tournamentRecords: TournamentRecords;
}): ResultType & { linkedTournamentIds?: string[] } {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const linkedTournamentIds = Object.assign(
    {},
    ...Object.keys(tournamentRecords).map((tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      const touranmentId = tournamentRecord?.tournamentId;

      // CODES: mode-agnostic read of `record.linkedTournamentIds` (first-class)
      // with extension fallback (legacy `{tournamentIds: []}` wrapper shape).
      const tournamentIds = getRecordLinkedTournamentIds(tournamentRecord).filter(
        (currentTournamentId) => currentTournamentId !== touranmentId,
      );

      return { [tournamentId]: tournamentIds };
    }),
  );

  return { linkedTournamentIds };
}
