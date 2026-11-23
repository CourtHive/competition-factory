import { getUpdatedSchedulingProfile } from '@Query/matchUps/scheduling/getUpdatedSchedulingProfile';
import { validateSchedulingProfile } from '@Query/scheduling/validateSchedulingProfile';
import { setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { getCompetitionDateRange } from '@Query/tournaments/getCompetitionDateRange';
import { getEventIdsAndDrawIds } from '@Query/tournaments/getEventIdsAndDrawIds';
import { getSchedulingProfile } from '@Query/scheduling/getSchedulingProfile';
import { getCompetitionVenues } from '@Query/venues/venuesAndCourtsGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { MODIFY_SCHEDULING_PROFILE } from '@Constants/topicConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import {
  SCHEDULING_PROFILE_DATES_OUT_OF_RANGE,
  SCHEDULING_PROFILE_REPAIR_REQUIRED,
} from '@Constants/errorConditionConstants';

/**
 * A scheduler's refusal to run on a profile that needs repair: nothing is written, and the context offers the repaired
 * profile (with what was changed and why) for the caller to save with setSchedulingProfile, on both sides.
 */
export function schedulingProfileRepairRefusal({
  schedulingProfile,
  modifications,
  issues,
}: {
  schedulingProfile?: unknown[];
  modifications?: number;
  issues?: string[];
}) {
  return decorateResult({
    result: { error: SCHEDULING_PROFILE_REPAIR_REQUIRED },
    info: 'the scheduling profile names a venue, event or draw that is gone; save the repaired profile first',
    context: { repairedSchedulingProfile: schedulingProfile, modifications, issues },
    stack: 'schedulingProfileRepairRefusal',
  });
}

type ProfileDatesWarning = typeof SCHEDULING_PROFILE_DATES_OUT_OF_RANGE & { scheduleDates: string[] };

/**
 * The profile's dates that fall outside the competition's dates (every record's range combined, as
 * addSchedulingProfileRound judges a new date), compared as calendar days. Nothing when a record has no dates.
 */
function profileDatesWarning({
  tournamentRecords,
  schedulingProfile,
}: {
  tournamentRecords: TournamentRecords;
  schedulingProfile?: { scheduleDate: string }[];
}): ProfileDatesWarning | undefined {
  if (!schedulingProfile?.length) return undefined;
  const { startDate, endDate } = getCompetitionDateRange({ tournamentRecords });
  if (!startDate || !endDate) return undefined;
  const scheduleDates: string[] = schedulingProfile
    .map(({ scheduleDate }) => scheduleDate)
    .filter((scheduleDate) => {
      const day = extractDate(scheduleDate);
      return day < startDate || day > endDate;
    });
  return scheduleDates.length ? { ...SCHEDULING_PROFILE_DATES_OUT_OF_RANGE, scheduleDates } : undefined;
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

  // saved regardless: a refusal would block legitimate saves (see SCHEDULING_PROFILE_DATES_OUT_OF_RANGE)
  const warning = profileDatesWarning({ tournamentRecords, schedulingProfile });
  return warning ? { ...SUCCESS, warnings: [warning] } : { ...SUCCESS };
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
    const { schedulingProfile, modifications, issues, error } = getSchedulingProfile({
      tournamentRecords,
      tournamentRecord,
    });
    if (error) return { error };
    if (!modifications) return { ...SUCCESS, modifications, issues };
    // the mutation that orphaned a round saves the repair, on every side it runs on
    const result = setSchedulingProfile({ tournamentRecords, tournamentRecord, schedulingProfile });
    return { ...result, modifications, issues };
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
