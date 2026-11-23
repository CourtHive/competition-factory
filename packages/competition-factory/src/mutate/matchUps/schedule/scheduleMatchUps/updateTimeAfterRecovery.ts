import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import { definedAttributes } from '@Tools/definedAttributes';
import { processNextMatchUps } from './processNextMatchUps';
import { addMinutesWithinDay } from './timeWithinDay';
import { extractTime } from '@Tools/dateTime';
import { ensureInt } from '@Tools/ensureInt';
import {
  addParticipantPotentialRecovery,
  checkParticipantProfileInitialization,
} from './checkParticipantProfileInitialization';

// types
import { HydratedMatchUp } from '@Types/hydrated';

type UpdateTimeAfterRecoveryArgs = {
  matchUpNotBeforeTimes: { [key: string]: any };
  reachability: ParticipantReachability;
  typeChangeRecoveryMinutes?: number;
  individualParticipantProfiles: any;
  averageMatchUpMinutes?: number;
  recoveryMinutes?: number;
  scheduleTime: string;
  matchUp: HydratedMatchUp;
  /** where the matchUp is played: a participant's next matchUp at another venue waits for the transit too (§ 3.4) */
  venueId?: string;
};
export function updateTimeAfterRecovery({
  individualParticipantProfiles,
  typeChangeRecoveryMinutes,
  averageMatchUpMinutes = 0,
  matchUpNotBeforeTimes,
  recoveryMinutes = 0,
  reachability,
  scheduleTime,
  matchUp,
  venueId,
}: UpdateTimeAfterRecoveryArgs) {
  const endTime = extractTime(matchUp?.schedule?.endTime);
  // when play ends: transit to another venue counts from here, recovery from here too
  const playEndTime = endTime || addMinutesWithinDay(scheduleTime, ensureInt(averageMatchUpMinutes));
  const timeAfterRecovery = endTime
    ? addMinutesWithinDay(endTime, ensureInt(recoveryMinutes))
    : addMinutesWithinDay(scheduleTime, ensureInt(averageMatchUpMinutes) + ensureInt(recoveryMinutes));

  const typeChangeTimeAfterRecovery =
    typeChangeRecoveryMinutes &&
    (endTime
      ? addMinutesWithinDay(extractTime(endTime), ensureInt(typeChangeRecoveryMinutes))
      : addMinutesWithinDay(scheduleTime, ensureInt(averageMatchUpMinutes) + ensureInt(typeChangeRecoveryMinutes)));
  // only participants already placed in the matchUp's sides are certain to play it; a participant placed in a matchUp
  // that feeds it, whatever date that matchUp is on, is a potential booking, because a winner path and a loser path
  // cannot both be taken
  const { certain, near: participantIdDependencies } = getReachableParticipantIds(reachability, matchUp.matchUpId);

  participantIdDependencies.forEach((participantId) => {
    checkParticipantProfileInitialization({
      individualParticipantProfiles,
      participantId,
    });

    // a booking keeps both ends: which recovery applies depends on the type of the participant's OTHER matchUp, which
    // checkRecoveryTime knows and this booking does not
    const booking = definedAttributes({
      typeChangeTimeAfterRecovery: typeChangeTimeAfterRecovery || undefined,
      matchUpType: matchUp.matchUpType,
      endTime: venueId ? playEndTime : undefined,
      timeAfterRecovery,
      scheduleTime,
      venueId,
    });

    // check whether this participantId is potential or actual for this matchUp
    if (!certain.includes(participantId)) {
      addParticipantPotentialRecovery({
        individualParticipantProfiles,
        drawId: matchUp.drawId,
        participantId,
        booking,
      });
    } else {
      individualParticipantProfiles[participantId].timeAfterRecovery = timeAfterRecovery;
      individualParticipantProfiles[participantId].bookings.push(booking);
    }
  });

  processNextMatchUps({
    linkedTargetIds: reachability.linkedTargets?.[matchUp.matchUpId],
    matchUpNotBeforeTimes,
    timeAfterRecovery,
    matchUp,
  });
}
