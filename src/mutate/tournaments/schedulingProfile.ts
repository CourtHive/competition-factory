import { firstClassGroupLeafOrExtension, setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { validateSchedulingProfile } from '@Validators/validateSchedulingProfile';
import { getEventIdsAndDrawIds } from '@Query/tournaments/getEventIdsAndDrawIds';
import { getCompetitionVenues } from '@Query/venues/venuesAndCourtsGetter';
import { addNotice } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getMultipleVenueRoundIssues,
  getUpdatedSchedulingProfile,
} from '@Query/matchUps/scheduling/getUpdatedSchedulingProfile';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { MODIFY_SCHEDULING_PROFILE } from '@Constants/topicConstants';
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

  // CODES: apply to every tournamentRecord (discover semantics) using the
  // group-leaf helper so writes land on `scheduling.profile` and / or the
  // legacy `schedulingProfile` extension based on schemaWriteMode.
  const targets = tournamentRecord ? [tournamentRecord] : Object.values(tournamentRecords ?? {});
  for (const target of targets) {
    setGroupLeafOrExtension({
      element: target,
      groupAttribute: 'scheduling',
      leafAttribute: 'profile',
      name: SCHEDULING_PROFILE,
      value: schedulingProfile,
    });
    // the scheduling profile (an extension) previously changed silently — cover it so
    // consumers (read-model projection) can react to the scheduling plan changing.
    addNotice({
      topic: MODIFY_SCHEDULING_PROFILE,
      payload: { tournamentId: target.tournamentId, schedulingProfile },
      key: target.tournamentId,
    });
  }
  return { ...SUCCESS };
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
