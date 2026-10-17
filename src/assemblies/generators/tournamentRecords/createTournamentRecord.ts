import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { extensionConstants } from '@Constants/extensionConstants';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { isValidExtension } from '@Validators/isValidExtension';
import { validDateString } from '@Validators/regex';
import { isISODateString } from '@Tools/dateTime';
import { nowMs } from '@Tools/clock';
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

  // the creating factory is on file from the start; every later write refreshes `version` and keeps `createdVersion`.
  // A `factory` the caller supplies is history and is kept as given, never backfilled.
  const { FACTORY } = extensionConstants;
  if (!firstClassOrExtension({ element: attributes, attribute: 'factory', name: FACTORY })) {
    const version = factoryVersion();
    setFirstClassOrExtension({
      value: { createdVersion: version, version, timeStamp: nowMs() },
      element: attributes,
      attribute: 'factory',
      name: FACTORY,
    });
  }

  return { ...attributes };
}
