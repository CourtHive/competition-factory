import { getExtensionUpdate } from './getExtensionUpdate';

// constants
import { SCHEDULE_LIMITS } from '@Constants/extensionConstants';

export function getMatchUpDailyLimitsUpdate({ tournamentRecords }) {
  return getExtensionUpdate({
    extensionName: SCHEDULE_LIMITS,
    firstClass: { groupAttribute: 'scheduling', leafAttribute: 'dailyLimits' },
    tournamentRecords,
  });
}
