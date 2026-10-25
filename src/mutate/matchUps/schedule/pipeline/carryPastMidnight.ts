import { getReachableParticipantIds } from '../scheduleMatchUps/getParticipantReachability';
import { processNextMatchUps } from '../scheduleMatchUps/processNextMatchUps';
import { addDaysToDate, endOnTheDay } from '@Tools/civilDateTime';
import { definedAttributes } from '@Tools/definedAttributes';
import { extractDate } from '@Tools/dateTime';
import {
  addParticipantPotentialRecovery,
  checkParticipantProfileInitialization,
} from '../scheduleMatchUps/checkParticipantProfileInitialization';

// constants and types
import type { PlaceVenueRoundsArgs } from './placeVenueRounds';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { Minutes, PlanningView } from './view';
import type { SchedulePlan } from './plan';

type CarryArgs = {
  individualParticipantProfiles: PlaceVenueRoundsArgs['individualParticipantProfiles'];
  matchUpNotBeforeTimes: PlaceVenueRoundsArgs['matchUpNotBeforeTimes'];
  clearScheduleDates?: boolean | string[];
  view: PlanningView;
  plan: SchedulePlan;
  scheduleDate: string;
};

/**
 * A recovery that runs past midnight carries into the next date (scheduling-pipeline.md § 9.8). Each matchUp timed on
 * the day before, whether stored there or placed there by this plan, whose average and recovery minutes end after
 * midnight books its participants on this date from 00:00 to the minute recovery ends, and its dependents may not
 * start before it. A matchUp whose recovery ends before midnight carries nothing, so a schedule that never crosses
 * midnight is planned as before. The minutes are the matchUp's own (its format and event), as a timed matchUp's
 * recovery is read (C1). The policy's overnight times are not added.
 */
export function carryPastMidnight({
  individualParticipantProfiles,
  matchUpNotBeforeTimes,
  clearScheduleDates,
  scheduleDate,
  view,
  plan,
}: CarryArgs) {
  const previousDate = addDaysToDate(scheduleDate, -1);
  if (!previousDate) return;

  for (const { matchUpId, scheduleTime, minutes } of timedTheDayBefore({
    view,
    plan,
    previousDate,
    clearScheduleDates,
  })) {
    const averageMinutes = minutes?.averageMinutes ?? 0;
    const recoveryMinutes = minutes?.recoveryMinutes ?? 0;
    const typeChangeRecoveryMinutes = minutes?.typeChangeRecoveryMinutes || recoveryMinutes;
    const past = endOnTheDay(scheduleTime, averageMinutes + recoveryMinutes).minutesPastMidnight;
    const typeChangePast = endOnTheDay(scheduleTime, averageMinutes + typeChangeRecoveryMinutes).minutesPastMidnight;
    if (!past && !typeChangePast) continue;

    const timeAfterRecovery = endOnTheDay('00:00', past).endTime;
    const typeChangeTimeAfterRecovery = endOnTheDay('00:00', typeChangePast).endTime;
    const matchUp = view.hydrated.find((candidate) => candidate.matchUpId === matchUpId);
    if (!matchUp) continue;

    const booking = definedAttributes({
      typeChangeTimeAfterRecovery: typeChangePast ? typeChangeTimeAfterRecovery : undefined,
      matchUpType: matchUp.matchUpType,
      scheduleTime: '00:00',
      timeAfterRecovery,
    });

    const { certain, near } = getReachableParticipantIds(view.reachability, matchUpId);
    for (const participantId of near) {
      checkParticipantProfileInitialization({ individualParticipantProfiles, participantId });
      if (certain.includes(participantId)) {
        const profile = individualParticipantProfiles[participantId];
        if (!profile.timeAfterRecovery || timeAfterRecovery > profile.timeAfterRecovery)
          profile.timeAfterRecovery = timeAfterRecovery;
        profile.bookings.push(booking);
      } else {
        addParticipantPotentialRecovery({
          individualParticipantProfiles,
          drawId: matchUp.drawId,
          participantId,
          booking,
        });
      }
    }

    if (past) {
      processNextMatchUps({
        linkedTargetIds: view.reachability.linkedTargets?.[matchUpId],
        matchUpNotBeforeTimes,
        timeAfterRecovery,
        matchUp,
      });
    }
  }
}

type Timed = { matchUpId: string; scheduleTime: string; minutes?: Minutes };

/** the matchUps timed on the day before: those this plan placed there, and those stored there that it left */
function timedTheDayBefore({
  clearScheduleDates,
  previousDate,
  view,
  plan,
}: {
  clearScheduleDates?: boolean | string[];
  previousDate: string;
  view: PlanningView;
  plan: SchedulePlan;
}): Timed[] {
  const timed: Timed[] = [];
  const planned = view.dates.find((datePlan) => datePlan.scheduleDate === previousDate);

  const placements = Object.values(plan.placements[previousDate] ?? {}).flat();
  if (planned) {
    const roundMinutes: { [matchUpId: string]: Minutes } = {};
    for (const round of planned.venues.flatMap((venue) => venue.rounds)) {
      if (!round.minutes) continue;
      for (const matchUpId of round.profiledMatchUpIds) roundMinutes[matchUpId] = round.minutes;
    }
    for (const { matchUpId, scheduleTime } of placements) {
      timed.push({ matchUpId, scheduleTime, minutes: roundMinutes[matchUpId] });
    }
  }

  // a planned date whose schedule is cleared keeps nothing stored on it
  const cleared =
    !!planned && (Array.isArray(clearScheduleDates) ? clearScheduleDates.includes(previousDate) : !!clearScheduleDates);
  if (cleared) return timed;

  const placed = new Set(placements.map(({ matchUpId }) => matchUpId));
  for (const matchUp of view.hydrated) {
    const { scheduledDate, scheduledTime } = matchUp.schedule ?? {};
    if (!scheduledTime || matchUp.matchUpStatus === BYE || placed.has(matchUp.matchUpId)) continue;
    if (extractDate(scheduledDate) !== previousDate) continue;
    timed.push({
      matchUpId: matchUp.matchUpId,
      scheduleTime: scheduledTime,
      minutes: view.timedMinutes[matchUp.matchUpId],
    });
  }
  return timed;
}
