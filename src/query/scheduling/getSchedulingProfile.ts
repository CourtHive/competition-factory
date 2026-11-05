import { firstClassGroupLeafOrExtension } from '@Helpers/extensions/firstClassGroupLeafOrExtension';
import { getEventIdsAndDrawIds } from '@Query/tournaments/getEventIdsAndDrawIds';
import { getCompetitionVenues } from '@Query/venues/venuesAndCourtsGetter';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getMultipleVenueRoundIssues,
  getUpdatedSchedulingProfile,
} from '@Query/matchUps/scheduling/getUpdatedSchedulingProfile';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

type GetSchedulingProfileArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
};

export function getSchedulingProfile({ tournamentRecords, tournamentRecord }: GetSchedulingProfileArgs): {
  schedulingProfile?: any;
  modifications?: number;
  error?: ErrorType;
  issues?: string[];
} {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  // CODES: prefer first-class `tournamentRecord.scheduling.profile`; fall back
  // to the legacy extension. When tournamentRecord is not provided, discover
  // across all records and use the first that carries either surface.
  const resolveProfile = (record: Tournament | undefined) =>
    record &&
    firstClassGroupLeafOrExtension({
      element: record,
      groupAttribute: 'scheduling',
      leafAttribute: 'profile',
      name: SCHEDULING_PROFILE,
    });

  let schedulingProfile =
    resolveProfile(tournamentRecord) ??
    Object.values(tournamentRecords)
      .map(resolveProfile)
      .find((p) => p !== undefined) ??
    [];

  if (schedulingProfile.length) {
    // a venue with no courts (none added yet, or all removed) is still a venue: its rounds are kept and place nothing
    // (CA 2026-10-23); only a venue, event or draw that is gone needs repair
    const { venueIds } = getCompetitionVenues({ tournamentRecords });
    const { eventIds, drawIds } = getEventIdsAndDrawIds({ tournamentRecords });

    const { updatedSchedulingProfile, modifications, issues } = getUpdatedSchedulingProfile({
      schedulingProfile,
      venueIds,
      eventIds,
      drawIds,
    });

    // the repaired profile is returned, never saved: this is a query, run on one side only, and a save here parted
    // the client's record from the server's (CA 2026-10-23). A scheduler refuses until it is repaired, and
    // checkAndUpdateSchedulingProfile (inside the mutations that orphan a round) or setSchedulingProfile saves it
    if (modifications) {
      schedulingProfile = updatedSchedulingProfile;
      issues.push(...getMultipleVenueRoundIssues({ schedulingProfile }));
      return { schedulingProfile: profileCopy(schedulingProfile), modifications, issues };
    }

    const multipleVenueRoundIssues = getMultipleVenueRoundIssues({ schedulingProfile });
    if (multipleVenueRoundIssues.length) {
      return { schedulingProfile: profileCopy(schedulingProfile), modifications: 0, issues: multipleVenueRoundIssues };
    }
  }

  return { schedulingProfile: profileCopy(schedulingProfile), modifications: 0 };
}

// A copy, never the stored profile: the schedulers annotate the rounds they are handed
// (`canScheduledMatchUpIds`, `possibleToSchedulePct`), and on the stored profile that was a write
// no notice announced. The profile is changed only by setSchedulingProfile, which announces it.
const profileCopy = <T>(schedulingProfile: T): T => makeDeepCopy(schedulingProfile, false, true);
