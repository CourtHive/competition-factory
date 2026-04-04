import { generateDateRange, timeStringMinutes } from '@Tools/dateTime';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Court } from '@Types/tournamentTypes';

// bulk update when tournament dates change
export function updateCourtAvailability({ tournamentRecord }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { startDate, endDate } = tournamentRecord;

  const tournamentDates = generateDateRange(startDate, endDate);

  const courts: Court[] = [];
  for (const venue of tournamentRecord.venues ?? []) {
    if (venue?.courts?.length) courts.push(...venue.courts);
  }

  for (const court of courts) {
    const { startTime, endTime } = (court.dateAvailability ?? []).reduce(
      (extents, availability) => {
        const startMinutes = timeStringMinutes(extents.startTime);
        const endMinutes = timeStringMinutes(extents.endTime);
        if (availability.startTime && timeStringMinutes(availability.startTime) < startMinutes)
          extents.startTime = availability.startTime;

        if (availability.endTime && timeStringMinutes(availability.endTime) > endMinutes)
          extents.endTime = availability.endTime;

        return extents;
      },
      { startTime: '08:00', endTime: '18:00' },
    );

    const updatedDateAvailability = tournamentDates.map((date) => {
      const existing = court.dateAvailability?.find((availability) => availability.date === date);
      return existing ?? { date, startTime, endTime };
    });

    const defaultAvailability = court.dateAvailability?.find((availability) => !availability.date);
    if (defaultAvailability) updatedDateAvailability.unshift(defaultAvailability);

    court.dateAvailability = updatedDateAvailability;
  }

  return { ...SUCCESS };
}
