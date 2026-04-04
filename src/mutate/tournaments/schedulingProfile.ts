import { getUpdatedSchedulingProfile } from '@Query/matchUps/scheduling/getUpdatedSchedulingProfile';
import { validateSchedulingProfile } from '@Validators/validateSchedulingProfile';
import { getCompetitionVenues } from '@Query/venues/venuesAndCourtsGetter';
import { removeExtension } from '../extensions/removeExtension';
import { getEventIdsAndDrawIds } from '@Query/tournaments/getEventIdsAndDrawIds';
import { addExtension } from '../extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';

import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
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

  const { extension } = findExtension({
    element: tournamentRecord, // if tournamentRecord is provided, use it
    name: SCHEDULING_PROFILE,
    tournamentRecords,
    discover: true,
  });

  let schedulingProfile = extension?.value ?? [];

  if (schedulingProfile.length) {
    const { venueIds } = getCompetitionVenues({
      requireCourts: true,
      tournamentRecords,
    });
    const { eventIds, drawIds } = getEventIdsAndDrawIds({ tournamentRecords });

    const { updatedSchedulingProfile, modifications, issues } = getUpdatedSchedulingProfile({
      schedulingProfile,
      venueIds,
      eventIds,
      drawIds,
    });

    if (modifications) {
      schedulingProfile = updatedSchedulingProfile;
      const result = setSchedulingProfile({
        tournamentRecords,
        tournamentRecord,
        schedulingProfile,
      });
      if (result.error) return result;

      return { schedulingProfile, modifications, issues };
    }
  }

  return { schedulingProfile, modifications: 0 };
}

type SetSchedulingProfileArgs = {
  tournamentRecords: TournamentRecords;
  tournamentRecord?: Tournament;
  schedulingProfile?: any[];
};
export function setSchedulingProfile({
  tournamentRecords,
  tournamentRecord,
  schedulingProfile,
}: SetSchedulingProfileArgs) {
  const profileValidity = validateSchedulingProfile({
    tournamentRecords,
    schedulingProfile,
  });

  if (profileValidity.error) return profileValidity;

  if (!schedulingProfile)
    return removeExtension({
      element: tournamentRecord,
      name: SCHEDULING_PROFILE,
      tournamentRecords,
      discover: true,
    });

  const extension = {
    name: SCHEDULING_PROFILE,
    value: schedulingProfile,
  };

  return addExtension({ tournamentRecords, discover: true, extension });
}

export function checkAndUpdateSchedulingProfile(params) {
  const { tournamentRecord } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ||
    {};

  if (!params.schedulingProfile) {
    const { modifications, issues } = getSchedulingProfile({
      tournamentRecords,
      tournamentRecord,
    });
    return { success: !modifications, modifications, issues };
  }

  const { venueIds } = getCompetitionVenues({ tournamentRecords });
  const { eventIds, drawIds } = getEventIdsAndDrawIds({ tournamentRecords });

  const { updatedSchedulingProfile, modifications, issues } = getUpdatedSchedulingProfile({
    schedulingProfile: params.schedulingProfile,
    venueIds,
    eventIds,
    drawIds,
  });

  if (modifications) {
    return {
      ...setSchedulingProfile({
        schedulingProfile: updatedSchedulingProfile,
        tournamentRecords,
      }),
      modifications,
      issues,
    };
  }

  return { ...SUCCESS, modifications, issues };
}
