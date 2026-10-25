import { canonicalTime } from '@Tools/canonicalClock';

function getInt(value) {
  return parseInt(value);
}

/** Both are times (scheduling-pipeline.md § 9.9) and the end does not come before the start. */
export function validTimePeriod({ startTime = '', endTime = '' } = {}) {
  const start = canonicalTime(startTime);
  const end = canonicalTime(endTime);
  // canonical HH:MM orders as a string
  return !!start && !!end && end >= start;
}

export function startTimeSort(a, b) {
  const [startHourA, startMinuteA] = a.startTime.split(':').map(getInt);
  const [startHourB, startMinuteB] = b.startTime.split(':').map(getInt);
  if (startHourA < startHourB) return -1;
  if (startHourA > startHourB) return 1;
  if (startMinuteA < startMinuteB) return -1;
  if (startMinuteA > startMinuteB) return 1;
  return 0;
}
