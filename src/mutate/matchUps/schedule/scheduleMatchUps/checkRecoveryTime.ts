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

  // Collect the participantIds whose existing bookings overlap the proposed
  // schedule window (matchUp duration + recovery). Used for explanation in
  // the drawer; original boolean semantics preserved via `blockingParticipantIds.length === 0`.
  const blockingParticipantIds: string[] = [];
  for (const participantId of participantIdDependencies) {
    checkParticipantProfileInitialization({
      individualParticipantProfiles,
      participantId,
    });

    const profile = individualParticipantProfiles[participantId];
    if (!profile.timeAfterRecovery) continue;

    const endTime = extractTime(matchUp?.schedule?.endTime);
    const timeAfterRecovery = endTime
      ? addMinutesToTimeString(endTime, ensureInt(recoveryMinutes))
      : addMinutesToTimeString(scheduleTime, ensureInt(averageMatchUpMinutes) + ensureInt(recoveryMinutes));

    const potentialParticipantBookings = Object.keys(profile.potentialBookings)
      .filter((drawId) => drawId !== matchUp.drawId)
      .flatMap((drawId) => profile.potentialBookings[drawId]);

    const participantBookings = [...potentialParticipantBookings, ...profile.bookings];

    const timeOverlap = !!participantBookings.find(
      (booking) => analyzeScheduleOverlap({ scheduleTime, timeAfterRecovery }, booking).hasOverlap,
    );

    if (timeOverlap) blockingParticipantIds.push(participantId);
  }

  const sufficientTimeForIndiiduals = blockingParticipantIds.length === 0;

  const notBeforeTime = matchUpNotBeforeTimes[matchUp.matchUpId];
  const timeBetweenMatchUps = notBeforeTime
    ? minutesDifference(timeToDate(notBeforeTime), timeToDate(scheduleTime), false)
    : 0;
  const sufficientTimeBetweenMatchUps = timeBetweenMatchUps >= 0;

  const enoughTime = sufficientTimeForIndiiduals && sufficientTimeBetweenMatchUps;

  return { enoughTime, blockingParticipantIds, notBeforeTime };
}
