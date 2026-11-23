import { sameDay } from '@Tools/dateTime';

export function getCourtDateAvailability({ court, date }) {
  const targetDateAvailability =
    date && court.dateAvailability?.find((availability) => sameDay(availability.date, date));
  const defaultAvailability = court.dateAvailability?.find((availability) => !availability.date);

  return targetDateAvailability || defaultAvailability;
}
