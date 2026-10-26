import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import { checkParticipantProfileInitialization } from './checkParticipantProfileInitialization';
import { transitMinutes, VenueTransit } from '../pipeline/transit';
import { analyzeScheduleOverlap } from './analyzeScheduleOverlap';
import { minutesDifference, timeToDate } from '@Tools/dateTime';
import { addMinutesWithinDay } from './timeWithinDay';
import { HydratedMatchUp } from '@Types/hydrated';
import { ensureInt } from '@Tools/ensureInt';

type CheckRecoveryTimeArgs = {
  individualParticipantProfiles: { [key: string]: any };
  matchUpNotBeforeTimes: { [key: string]: any };
  reachability: ParticipantReachability;
  matchUp: HydratedMatchUp;
  scheduleTime: string;
  details?: any;
  /** where the matchUp would be played, and the transit between venues (§ 3.4): absent, no transit applies */
  transit?: VenueTransit;
  venueId?: string;
};
export function checkRecoveryTime({
  individualParticipantProfiles,
  matchUpNotBeforeTimes,
  reachability,
  scheduleTime,
  matchUp,
  details,
  transit,
  venueId,
}: CheckRecoveryTimeArgs) {
  const participantIdDependencies = getReachableParticipantIds(reachability, matchUp.matchUpId).near;

  const minutes = details?.minutesMap?.[matchUp.matchUpId];
  const averageMatchUpMinutes = ensureInt(minutes?.averageMinutes || 0);
  const recoveryMinutes = ensureInt(minutes?.recoveryMinutes || 0);
  const typeChangeRecoveryMinutes = ensureInt(minutes?.typeChangeRecoveryMinutes || 0) || recoveryMinutes;

  // the window proposed starts at scheduleTime; a stored endTime records an earlier play of this matchUp and says
  // nothing about this placement (R6: it made the window end before it started)
  const afterRecovery = (minutesOfRecovery: number) =>
    addMinutesWithinDay(scheduleTime, averageMatchUpMinutes + minutesOfRecovery);
  const timeAfterRecovery = afterRecovery(recoveryMinutes);
  const proposedEndTime = afterRecovery(0);
  const typeChangeTimeAfterRecovery = afterRecovery(typeChangeRecoveryMinutes);

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
    const potentialParticipantBookings = Object.keys(profile.potentialBookings)
      .filter((drawId) => drawId !== matchUp.drawId)
      .flatMap((drawId) => profile.potentialBookings[drawId]);

    // a participant with only potential bookings (in other draws) must still be checked against them
    if (!profile.timeAfterRecovery && !potentialParticipantBookings.length) continue;

    const participantBookings = [...potentialParticipantBookings, ...profile.bookings];

    // a booking of another matchUpType is separated from this matchUp by the type-change recovery, in either order
    const timeOverlap = participantBookings.some((booking) => {
      const typeChange = !!booking.matchUpType && booking.matchUpType !== matchUp.matchUpType;
      const proposed = {
        scheduleTime,
        timeAfterRecovery: typeChange ? typeChangeTimeAfterRecovery : timeAfterRecovery,
      };
      const existing = typeChange
        ? { ...booking, timeAfterRecovery: booking.typeChangeTimeAfterRecovery ?? booking.timeAfterRecovery }
        : { ...booking };
      // at another venue each side is held until its play ends plus the transit to the other, when that is the later:
      // recovery counts toward transit (§ 3.4; CA 2026-10-25)
      if (booking.venueId && venueId && booking.venueId !== venueId) {
        const fromBooking = transitMinutes(transit, booking.venueId, venueId);
        const toBooking = transitMinutes(transit, venueId, booking.venueId);
        if (fromBooking && booking.endTime) {
          const arrival = addMinutesWithinDay(booking.endTime, fromBooking);
          if (arrival > existing.timeAfterRecovery) existing.timeAfterRecovery = arrival;
        }
        if (toBooking) {
          const arrival = addMinutesWithinDay(proposedEndTime, toBooking);
          if (arrival > proposed.timeAfterRecovery) proposed.timeAfterRecovery = arrival;
        }
      }
      return analyzeScheduleOverlap(proposed, existing).hasOverlap;
    });

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
