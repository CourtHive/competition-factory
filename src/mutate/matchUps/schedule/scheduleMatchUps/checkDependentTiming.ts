import { addMinutesToTimeString, timeStringMinutes } from '@Tools/dateTime';

export function checkDependendantTiming({
  matchUpScheduleTimes,
  matchUpDependencies,
  scheduleTime,
  matchUpId,
  details,
}) {
  let scheduledDependent;

  const recoveryMinutes = details.minutesMap?.[matchUpId]?.recoveryMinutes;
  const averageMatchUpMinutes = details.minutesMap?.[matchUpId]?.averageMinutes;
  const totalMinutes = (averageMatchUpMinutes || 0) + (recoveryMinutes || 0);
  const dependentNotBeforeTime = addMinutesToTimeString(scheduleTime, totalMinutes);

  const matchUpIdDependents = matchUpDependencies?.[matchUpId]?.dependentMatchUpIds ?? [];

  if (matchUpIdDependents.length) {
    const earliestDependent = matchUpIdDependents.reduce((dependent, candidateId) => {
      const candidateScheduleTime = matchUpScheduleTimes[candidateId];
      if (!candidateScheduleTime) return dependent;

      const candidateDependent = {
        scheduleTime: candidateScheduleTime,
        matchUpId: candidateId,
      };
      if (candidateScheduleTime && !dependent.matchUpId) return candidateDependent;

      return timeStringMinutes(candidateScheduleTime) < timeStringMinutes(dependent.scheduleTime)
        ? candidateDependent
        : dependent;
    }, {});
    if (
      earliestDependent.scheduleTime &&
      timeStringMinutes(dependentNotBeforeTime) > timeStringMinutes(earliestDependent.scheduleTime)
    ) {
      scheduledDependent = earliestDependent;
    }
  }

  return { scheduledDependent };
}
