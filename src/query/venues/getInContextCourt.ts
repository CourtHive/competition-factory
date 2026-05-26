import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { applyVenueConstraints } from './applyVenueConstraints';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { isObject } from '@Tools/objects';

import { DISABLED } from '@Constants/extensionConstants';

export function getInContextCourt({ convertExtensions, ignoreDisabled, venue, court }) {
  const inContextCourt = {
    ...makeDeepCopy(court, convertExtensions, true),
    venueId: venue.venueId,
  };
  const disabledValue = firstClassOrExtension({ element: court, attribute: 'disabled', name: DISABLED });

  if (ignoreDisabled && disabledValue !== undefined) {
    const disabledDates = isObject(disabledValue) ? disabledValue?.dates : undefined;

    const dateAvailability =
      disabledValue === true
        ? []
        : inContextCourt.dateAvailability
            .map((availability) => {
              const date = availability.date;
              if (!date || disabledDates.includes(date)) return undefined; // ignore defaultAvailility (no date)
              return availability;
            })
            .filter(Boolean);

    inContextCourt.dateAvailability = dateAvailability;
  }

  applyVenueConstraints({ inContextCourt, venue });

  return { inContextCourt };
}
