import { getExtensionUpdate } from './getExtensionUpdate';

// constants
import { SCHEDULE_LIMITS } from '@Constants/extensionConstants';
import type { TournamentRecords } from '@Types/factoryTypes';

type GetMatchUpDailyLimitsUpdateArgs = {
  tournamentRecords: TournamentRecords;
};
export function getMatchUpDailyLimitsUpdate({ tournamentRecords }: GetMatchUpDailyLimitsUpdateArgs) {
  return getExtensionUpdate({
    extensionName: SCHEDULE_LIMITS,
    firstClass: { groupAttribute: 'scheduling', leafAttribute: 'dailyLimits' },
    tournamentRecords,
  });
}
