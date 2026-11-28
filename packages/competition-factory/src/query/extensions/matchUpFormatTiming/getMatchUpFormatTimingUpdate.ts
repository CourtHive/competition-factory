import { getExtensionUpdate } from '@Query/extensions/getExtensionUpdate';

// constants
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import type { TournamentRecords } from '@Types/factoryTypes';

type GetMatchUpFormatTimingUpdateArgs = {
  tournamentRecords: TournamentRecords;
};
export function getMatchUpFormatTimingUpdate({ tournamentRecords }: GetMatchUpFormatTimingUpdateArgs) {
  return getExtensionUpdate({
    extensionName: SCHEDULE_TIMING,
    firstClass: { groupAttribute: 'scheduling', leafAttribute: 'timing' },
    tournamentRecords,
  });
}
