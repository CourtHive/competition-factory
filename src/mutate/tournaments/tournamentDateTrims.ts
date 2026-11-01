import { firstClassGroupLeafOrExtension, setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { addNotice } from '@Global/state/globalState';
import { extractDate } from '@Tools/dateTime';

// constants and types
import type { DateSchedulingProfile, ProfileRound, ProfileVenue } from '@Query/matchUps/scheduling/schedulingUtils';
import { MODIFY_SCHEDULING_PROFILE } from '@Constants/topicConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import type { Tournament } from '@Types/tournamentTypes';

type ProfileDate = DateSchedulingProfile;

/** A date's entry, in profile shape, holding only what left the profile. */
export type TrimmedProfileDate = DateSchedulingProfile;

/**
 * Active dates that left a tournament's or an event's list because they fell outside its new range. `eventId` is absent
 * for the tournament's own list. `activeDates` is the list that remains; absent when none remained, so the list is
 * unset and the tournament or event is active on every day of its range.
 */
export type ActiveDateChange = {
  previousActiveDates: string[];
  prunedActiveDates: string[];
  activeDates?: string[];
  eventId?: string;
};

const dayOf = (date?: Date | string) => (date ? extractDate(typeof date === 'string' ? date : date.toISOString()) : '');

const outside = (day: string, start: string, end: string) => (!!start && day < start) || (!!end && day > end);

/**
 * Removes from the stored scheduling profile what this tournament's dates no longer hold: on each profile date outside
 * the tournament's range, every round of this tournament (or naming no tournament) leaves the profile; a venue left
 * with no rounds there, and a date left with no venues, go too. Rounds of other tournaments of a competition stay,
 * since their dates are their tournament's to judge. The trimmed rounds' matchUps are no longer scheduled by the
 * profile; nothing already written to a matchUp is touched here.
 *
 * Saved, and announced with MODIFY_SCHEDULING_PROFILE, only when something was trimmed.
 */
export function trimSchedulingProfile({ tournamentRecord }: { tournamentRecord: Tournament }): TrimmedProfileDate[] {
  const start = dayOf(tournamentRecord.startDate);
  const end = dayOf(tournamentRecord.endDate);
  const schedulingProfile: ProfileDate[] | undefined = firstClassGroupLeafOrExtension({
    element: tournamentRecord,
    groupAttribute: 'scheduling',
    leafAttribute: 'profile',
    name: SCHEDULING_PROFILE,
  });
  if (!Array.isArray(schedulingProfile) || !schedulingProfile.length || (!start && !end)) return [];

  const { tournamentId } = tournamentRecord;
  const isThisTournaments = (round: ProfileRound) => !round?.tournamentId || round.tournamentId === tournamentId;

  const trimmed: TrimmedProfileDate[] = [];
  const updatedProfile: ProfileDate[] = [];
  for (const dateProfile of schedulingProfile) {
    if (!outside(dayOf(dateProfile.scheduleDate), start, end)) {
      updatedProfile.push(dateProfile);
      continue;
    }
    const keptVenues: ProfileVenue[] = [];
    const removedVenues: ProfileVenue[] = [];
    for (const venue of dateProfile.venues ?? []) {
      const rounds = venue.rounds ?? [];
      const removed = rounds.filter(isThisTournaments);
      const kept = rounds.filter((round) => !isThisTournaments(round));
      if (kept.length) keptVenues.push({ ...venue, rounds: kept });
      if (removed.length) removedVenues.push({ venueId: venue.venueId, rounds: removed });
    }
    if (keptVenues.length) updatedProfile.push({ ...dateProfile, venues: keptVenues });
    // a date that stays (other tournaments' rounds) and lost nothing is not reported
    if (!keptVenues.length || removedVenues.length)
      trimmed.push({ scheduleDate: dateProfile.scheduleDate, venues: removedVenues });
  }

  if (!trimmed.length) return [];

  setGroupLeafOrExtension({
    element: tournamentRecord,
    groupAttribute: 'scheduling',
    leafAttribute: 'profile',
    name: SCHEDULING_PROFILE,
    value: updatedProfile,
  });
  addNotice({
    topic: MODIFY_SCHEDULING_PROFILE,
    payload: { tournamentId, schedulingProfile: updatedProfile },
    key: tournamentId,
  });

  return trimmed;
}

/** The part of `activeDates` inside [start, end]; undefined when nothing was outside it. */
function pruneDates(activeDates: (Date | string)[] | undefined, start: string, end: string) {
  if (!activeDates?.length) return undefined;
  const previousActiveDates = activeDates.map(dayOf);
  const prunedActiveDates = previousActiveDates.filter((day) => outside(day, start, end));
  if (!prunedActiveDates.length) return undefined;
  const remaining = previousActiveDates.filter((day) => !outside(day, start, end));
  return { previousActiveDates, prunedActiveDates, activeDates: remaining.length ? remaining : undefined };
}

/**
 * Prunes active dates that fall outside the new ranges: the tournament's against the tournament range, each event's
 * against the event's own (possibly just reconciled) range, or the tournament's where the event has none.
 *
 * A list left empty is unset, and reported with no `activeDates`: an unset list means every day of the range, so the
 * tournament or event widens, and the report is how a caller sees that and sets new dates. Keeping the out-of-range
 * dates instead would leave a list naming days the range no longer holds. Each event whose list changes gets
 * MODIFY_EVENT; the tournament's change is carried by setTournamentDates' MODIFY_TOURNAMENT_DETAIL.
 */
export function pruneActiveDates({ tournamentRecord }: { tournamentRecord: Tournament }): ActiveDateChange[] {
  const tournamentStart = dayOf(tournamentRecord.startDate);
  const tournamentEnd = dayOf(tournamentRecord.endDate);
  const changes: ActiveDateChange[] = [];

  const tournamentPrune = pruneDates(tournamentRecord.activeDates, tournamentStart, tournamentEnd);
  if (tournamentPrune) {
    if (tournamentPrune.activeDates) tournamentRecord.activeDates = tournamentPrune.activeDates;
    else delete tournamentRecord.activeDates;
    changes.push(stripUndefined(tournamentPrune));
  }

  for (const event of tournamentRecord.events ?? []) {
    const start = dayOf(event.startDate) || tournamentStart;
    const end = dayOf(event.endDate) || tournamentEnd;
    const eventPrune = pruneDates(event.activeDates, start, end);
    if (!eventPrune) continue;
    if (eventPrune.activeDates) event.activeDates = eventPrune.activeDates;
    else delete event.activeDates;
    changes.push(stripUndefined({ eventId: event.eventId, ...eventPrune }));
    modifyEventNotice({ tournamentId: tournamentRecord.tournamentId, event });
  }

  return changes;
}

function stripUndefined(change: ActiveDateChange): ActiveDateChange {
  if (!change.activeDates) delete change.activeDates;
  return change;
}

/**
 * After a change of the tournament's range (a `startDate` or `endDate` was given; otherwise nothing): active dates and scheduling-profile dates outside the new ranges are
 * removed. `prunedTournamentActiveDates` is the tournament's remaining list when it was pruned ([] when none remained
 * and the list is unset), for the MODIFY_TOURNAMENT_DETAIL notice.
 */
export function trimToTournamentRange({
  tournamentRecord,
  startDate,
  endDate,
}: {
  tournamentRecord: Tournament;
  startDate?: string;
  endDate?: string;
}): {
  trimmedSchedulingProfile?: TrimmedProfileDate[];
  activeDateChanges?: ActiveDateChange[];
  prunedTournamentActiveDates?: string[];
} {
  if (!startDate && !endDate) return {};
  const activeDateChanges = pruneActiveDates({ tournamentRecord });
  const trimmedSchedulingProfile = trimSchedulingProfile({ tournamentRecord });
  const tournamentPruned = activeDateChanges.some((change) => !change.eventId);
  return {
    prunedTournamentActiveDates: tournamentPruned ? ((tournamentRecord.activeDates as string[]) ?? []) : undefined,
    trimmedSchedulingProfile: trimmedSchedulingProfile.length ? trimmedSchedulingProfile : undefined,
    activeDateChanges: activeDateChanges.length ? activeDateChanges : undefined,
  };
}
