import { checkParticipantProfileInitialization } from './checkParticipantProfileInitialization';
import { analyzeScheduleOverlap } from './analyzeScheduleOverlap';
import { ensureInt } from '@Tools/ensureInt';
import { addMinutesToTimeString, extractTime, minutesDifference, timeToDate } from '@Tools/dateTime';
import { HydratedMatchUp } from '@Types/hydrated';

type CheckRecoveryTimeArgs = {
  individualParticipantProfiles: { [key: string]: any };
  matchUpNotBeforeTimes: { [key: string]: any };
  matchUpDependencies: { [key: string]: any };
  matchUp: HydratedMatchUp;
  scheduleTime: string;
  details?: any;
};
export function checkRecoveryTime({
  individualParticipantProfiles,
  matchUpNotBeforeTimes,
  matchUpDependencies,
  scheduleTime,
  matchUp,
  details,
}: CheckRecoveryTimeArgs) {
  const participantIdDependencies = (matchUpDependencies?.[matchUp.matchUpId]?.participantIds ?? []).flat();

  const averageMatchUpMinutes = details?.minutesMap?.[matchUp.matchUpId]?.averageMinutes || 0;
  const recoveryMinutes = details?.minutesMap?.[matchUp.matchUpId]?.recoveryMinutes || 0;

  const sufficientTimeForIndiiduals = participantIdDependencies.every((participantId) => {
    checkParticipantProfileInitialization({
      individualParticipantProfiles,
      participantId,
    });

    const profile = individualParticipantProfiles[participantId];
    if (!profile.timeAfterRecovery) return true;

    // details are provided by jinnScheduler and this enables treating a participant's scheduled matchUps as "bookings"
    // if (details && timeBetween < 0) {
    const endTime = extractTime(matchUp?.schedule?.endTime);
    const timeAfterRecovery = endTime
      ? addMinutesToTimeString(endTime, ensureInt(recoveryMinutes))
      : addMinutesToTimeString(scheduleTime, ensureInt(averageMatchUpMinutes) + ensureInt(recoveryMinutes));

    const potentialParticipantBookings = Object.keys(profile.potentialBookings)
      .filter((drawId) => drawId !== matchUp.drawId)
      .map((drawId) => profile.potentialBookings[drawId])
      .flat();

    const participantBookings = [...potentialParticipantBookings, ...profile.bookings];

    const timeOverlap = !!participantBookings.find(
      (booking) => analyzeScheduleOverlap({ scheduleTime, timeAfterRecovery }, booking).hasOverlap,
    );

    return !timeOverlap;
  });

  const notBeforeTime = matchUpNotBeforeTimes[matchUp.matchUpId];
  const timeBetweenMatchUps = notBeforeTime
    ? minutesDifference(timeToDate(notBeforeTime), timeToDate(scheduleTime), false)
    : 0;
  const sufficientTimeBetweenMatchUps = timeBetweenMatchUps >= 0;

  const enoughTime = sufficientTimeForIndiiduals && sufficientTimeBetweenMatchUps;

  return { enoughTime };
}
