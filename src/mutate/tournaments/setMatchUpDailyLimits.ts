import { setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';

// constants and types
import { INVALID_OBJECT, INVALID_VALUES, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { SCHEDULE_LIMITS } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type SetMatchUpDailyLimitsArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  tournamentId: string;
  dailyLimits: any;
};
export function setMatchUpDailyLimits(params: SetMatchUpDailyLimitsArgs): ResultType {
  const { tournamentRecord, tournamentId, dailyLimits } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ||
    {};

  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };
  if (typeof dailyLimits !== 'object') return { error: INVALID_OBJECT };

  const tournamentIds = Object.keys(tournamentRecords).filter(
    (currentTournamentId) => !tournamentId || tournamentId === currentTournamentId,
  );

  if (tournamentId && !tournamentIds.includes(tournamentId)) return { error: INVALID_VALUES };

  for (const currentTournamentId of tournamentIds) {
    const tournamentRecord = tournamentRecords[currentTournamentId];
    const result = setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'dailyLimits',
      name: SCHEDULE_LIMITS,
      value: { dailyLimits },
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}
