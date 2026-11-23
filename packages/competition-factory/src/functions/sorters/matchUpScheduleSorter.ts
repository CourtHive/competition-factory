import { dateTime } from '@Tools/dateTime';

const { extractDate, extractTime, timeStringMinutes } = dateTime;

export function matchUpScheduleSort(a: any, b: any): number {
  const scheduleA = a.schedule ?? {};
  const scheduleB = b.schedule ?? {};
  if (scheduleA.scheduledDate && !scheduleB.scheduledDate) return 1;
  if (scheduleB.scheduledDate && !scheduleA.scheduledDate) return -1;
  if (scheduleA.scheduledDate && scheduleB.scheduledDate) {
    if (scheduleA.scheduledDate === scheduleB.scheduledDate) {
      if (scheduleA.scheduledTime && !scheduleB.scheduledTime) return 1;
      if (scheduleB.scheduledTime && !scheduleA.scheduledTime) return -1;
      if (scheduleA.scheduledTime && scheduleB.scheduledTime) {
        const timeA = timeStringMinutes(extractTime(scheduleA.scheduledTime));
        const timeB = timeStringMinutes(extractTime(scheduleB.scheduledTime));
        return timeA - timeB;
      }
    }
    // Lexical compare on the calendar-day portion — timezone-free and immune to the
    // `new Date('YYYY-MM-DD')` (UTC-midnight) vs `new Date('YYYY-MM-DDTHH:MM')` (local)
    // parse-mode mismatch that could flip ordering across midnight. Explicit 'en' locale
    // keeps the ordering byte-stable across machines.
    return extractDate(scheduleA.scheduledDate).localeCompare(extractDate(scheduleB.scheduledDate), 'en');
  }
  return 0;
}
