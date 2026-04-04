import { isValidExtension } from '@Validators/isValidExtension';
import { isISODateString } from '@Tools/dateTime';
import { validDateString } from '@Validators/regex';
import { UUID } from '@Tools/UUID';

import { isValidIANATimeZone } from '@Tools/timeZone';

// constants
import { INVALID_DATE, INVALID_TIME_ZONE } from '@Constants/errorConditionConstants';

export function createTournamentRecord(params): any {
  const { tournamentRecord, tournamentRecords, activeTournamentId, ...attributes } = params ?? {};
  attributes.tournamentId ??= UUID();
  if (attributes.startDate && !isISODateString(attributes.startDate) && !validDateString.test(attributes.startDate)) {
    return { error: INVALID_DATE };
  }

  if (attributes.endDate && !isISODateString(attributes.endDate) && !validDateString.test(attributes.endDate)) {
    return { error: INVALID_DATE };
  }

  if (attributes.activeDates) {
    const activeDates = attributes.activeDates.filter(Boolean);
    if (!activeDates.every((d) => isISODateString(d) || validDateString.test(d))) {
      return { error: INVALID_DATE };
    }
    if (activeDates.length) {
      // derive startDate/endDate from activeDates if not provided
      const sorted = [...activeDates].sort();
      attributes.startDate ??= sorted[0];
      attributes.endDate ??= sorted[sorted.length - 1];

      const validStart = activeDates.every((d) => new Date(d) >= new Date(attributes.startDate));
      const validEnd = activeDates.every((d) => new Date(d) <= new Date(attributes.endDate));
      if (!validStart || !validEnd) return { error: INVALID_DATE };
    }
    attributes.activeDates = activeDates;
  }

  if (attributes.localTimeZone && !isValidIANATimeZone(attributes.localTimeZone)) {
    return { error: INVALID_TIME_ZONE };
  }

  if (attributes.extensions) {
    attributes.extensions = attributes.extensions.filter(isValidExtension);
  }

  return { ...attributes };
}
