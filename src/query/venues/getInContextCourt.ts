import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { applyVenueConstraints } from './applyVenueConstraints';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { isObject } from '@Tools/objects';

// constants
import { DISABLED } from '@Constants/extensionConstants';
import { Availability } from '@Types/tournamentTypes';

export function getInContextCourt({ convertExtensions, ignoreDisabled, venue, court, dates = [] as string[] }) {
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
            .filter(Boolean)
            .concat(undatedOnDates({ availability: inContextCourt.dateAvailability, dates, disabledDates }));

    inContextCourt.dateAvailability = dateAvailability;
  }

  applyVenueConstraints({ inContextCourt, venue });

  return { inContextCourt };
}

// The undated availability holds on every date the court is not disabled. Dropped above, it is kept as a dated entry
// for each date the caller asked about that has no entry of its own, so a court disabled on one date keeps its hours
// on the others.
function undatedOnDates({
  availability,
  disabledDates,
  dates,
}: {
  availability?: Availability[];
  disabledDates?: string[];
  dates: string[];
}): Availability[] {
  const undated = availability?.find(({ date }) => !date);
  if (!undated) return [];
  const dated = new Set((availability ?? []).map(({ date }) => date).filter(Boolean));
  return dates
    .filter((date) => !dated.has(date) && !disabledDates?.includes(date))
    .map((date) => ({ ...undated, date }));
}
