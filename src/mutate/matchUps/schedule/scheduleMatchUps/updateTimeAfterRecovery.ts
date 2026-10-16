import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import { addMinutesToTimeString, extractTime } from '@Tools/dateTime';
import { definedAttributes } from '@Tools/definedAttributes';
import { processNextMatchUps } from './processNextMatchUps';
import { ensureInt } from '@Tools/ensureInt';
import {
  addParticipantPotentialRecovery,
  checkParticipantProfileInitialization,
} from './checkParticipantProfileInitialization';

// types
import { HydratedMatchUp } from '@Types/hydrated';

type UpdateTimeAfterRecoveryArgs = {
  matchUpPotentialParticipantIds: { [key: string]: string[] };
  matchUpNotBeforeTimes: { [key: string]: any };
  reachability: ParticipantReachability;
  typeChangeRecoveryMinutes?: number;
  individualParticipantProfiles: any;
  averageMatchUpMinutes?: number;
  recoveryMinutes?: number;
  scheduleTime: string;
  matchUp: HydratedMatchUp;
};
export function updateTimeAfterRecovery({
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  typeChangeRecoveryMinutes,
  averageMatchUpMinutes = 0,
  matchUpNotBeforeTimes,
  recoveryMinutes = 0,
  reachability,
  scheduleTime,
  matchUp,
}: UpdateTimeAfterRecoveryArgs) {
  const endTime = extractTime(matchUp?.schedule?.endTime);
  const timeAfterRecovery = endTime
    ? addMinutesToTimeString(endTime, ensureInt(recoveryMinutes))
    : addMinutesToTimeString(scheduleTime, ensureInt(averageMatchUpMinutes) + ensureInt(recoveryMinutes));

  const typeChangeTimeAfterRecovery =
    typeChangeRecoveryMinutes &&
    (endTime
      ? addMinutesToTimeString(extractTime(endTime), ensureInt(typeChangeRecoveryMinutes))
      : addMinutesToTimeString(scheduleTime, ensureInt(averageMatchUpMinutes) + ensureInt(typeChangeRecoveryMinutes)));
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
      timeAfterRecovery,
      scheduleTime,
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
    matchUpPotentialParticipantIds,
    matchUpNotBeforeTimes,
    timeAfterRecovery,
    matchUp,
  });
}
