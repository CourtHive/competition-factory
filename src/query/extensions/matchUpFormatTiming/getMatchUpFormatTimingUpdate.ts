import { getExtensionUpdate } from '../getExtensionUpdate';

import { SCHEDULE_TIMING } from '@Constants/extensionConstants';

export function getMatchUpFormatTimingUpdate({ tournamentRecords }) {
  return getExtensionUpdate({
    extensionName: SCHEDULE_TIMING,
    firstClass: { groupAttribute: 'scheduling', leafAttribute: 'timing' },
    tournamentRecords,
  });
}
