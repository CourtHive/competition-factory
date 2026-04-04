import { getScheduledCourtMatchUps, getScheduledVenueMatchUps } from '@Query/venues/getScheduledCourtMatchUps';
import { bulkScheduleTournamentMatchUps } from '../matchUps/schedule/bulkScheduleTournamentMatchUps';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { checkAndUpdateSchedulingProfile } from '../tournaments/schedulingProfile';
import { deletionMessage } from '@Assemblies/generators/matchUps/deletionMessage';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import venueTemplate from '@Assemblies/generators/templates/venueTemplate';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { requireParams } from '@Helpers/parameters/requireParams';
import { clearPrimaryVenue } from './clearPrimaryVenue';
import { addNotice } from '@Global/state/globalState';
import { findVenue } from '@Query/venues/findVenue';
import { validTimePeriod } from '@Validators/time';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { modifyCourt } from './modifyCourt';
import { addCourt } from './addCourt';

// constants and types
import { TOURNAMENT_RECORD, VENUE_ID } from '@Constants/attributeConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { Venue, Tournament } from '@Types/tournamentTypes';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  COURT_NOT_FOUND,
  ErrorType,
  INVALID_OBJECT,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VENUE_ID,
  VENUE_NOT_FOUND,
  NO_VALID_ATTRIBUTES,
} from '@Constants/errorConditionConstants';

type ModifyVenueArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  modifications: any;
  venueId: string;
  force?: boolean;
};
export function modifyVenue(params: ModifyVenueArgs) {
  const { modifications, venueId, force } = params;

  const tournamentRecords = resolveTournamentRecords(params);

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };
  if (typeof venueId !== 'string') return { error: MISSING_VENUE_ID };

  let error;
  let success;
  // in this case suppress NOT FOUND errors if there is at least one success
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = venueModify({
      tournamentRecord,
      modifications,
      venueId,
      force,
    });
    if (result.success) success = true;
    if (result.error) error = result.error;
    if (result.error && result.error !== VENUE_NOT_FOUND) return result;
  }

  checkAndUpdateSchedulingProfile({ tournamentRecords });

  return success ? { ...SUCCESS } : { error };
}

function handleCourtDeletions({
  venue,
  modifications,
  tournamentRecord,
  venueMatchUps,
  allowModificationWhenMatchUpsScheduled,
}: {
  venue: Venue;
  modifications: any;
  tournamentRecord: Tournament;
  venueMatchUps: any;
  allowModificationWhenMatchUpsScheduled: boolean;
}) {
  const existingCourtIds = venue?.courts?.map((court) => court.courtId) ?? [];
  const courtIdsToModify = modifications.courts?.map((court) => court.courtId) ?? [];
  const courtIdsToDelete = courtIdsToModify.length
    ? existingCourtIds.filter((courtId) => !courtIdsToModify.includes(courtId))
    : modifications?.courts && existingCourtIds;

  const matchUpsWithCourtId: { matchUpId: string; drawId: string }[] = [];
  if (courtIdsToDelete?.length) {
    const courtsToDelete = venue?.courts?.filter((court) => courtIdsToDelete.includes(court.courtId));
    const scheduleDeletionsCount = courtsToDelete
      ?.map((court) => {
        const result = getScheduledCourtMatchUps({
          courtId: court.courtId,
          tournamentRecord,
          venueMatchUps,
        });
        for (const matchUp of result.matchUps ?? []) {
          matchUpsWithCourtId.push({
            matchUpId: matchUp.matchUpId,
            drawId: matchUp.drawId,
          });
        }
        return result.matchUps?.length ?? 0;
      })
      .reduce((a, b) => a + b);
    if (venue && (!scheduleDeletionsCount || allowModificationWhenMatchUpsScheduled)) {
      venue.courts = venue.courts?.filter((court) => courtIdsToModify.includes(court.courtId));
      bulkScheduleTournamentMatchUps({
        schedule: { courtId: '', scheduledDate: '' },
        matchUpDetails: matchUpsWithCourtId,
        removePriorValues: true,
        tournamentRecord,
      });
      return { success: true };
    } else {
      return deletionMessage({
        matchUpsCount: scheduleDeletionsCount,
      });
    }
  }
  return { success: true };
}

function handleCourtModifications({
  modifications,
  tournamentRecord,
  venueMatchUps,
  venueId,
  force,
}: {
  modifications: any;
  tournamentRecord: Tournament;
  venueMatchUps: any;
  venueId: string;
  force?: boolean;
}) {
  if (modifications.courts) {
    for (const court of modifications.courts) {
      const { courtId } = court ?? {};
      let result = modifyCourt({
        modifications: court,
        disableNotice: true,
        tournamentRecord,
        venueMatchUps,
        courtId,
        force,
      });
      if (result?.error === COURT_NOT_FOUND) {
        result = addCourt({
          disableNotice: true,
          tournamentRecord,
          venueId,
          court,
        });
      }
      if (result?.error) return result;
    }
  }
  return { success: true };
}

export function venueModify({ tournamentRecord, modifications, venueId, force }: ModifyVenueArgs): {
  error?: ErrorType;
  success?: boolean;
  venue?: Venue;
  info?: string;
} {
  const paramsCheck = requireParams({ tournamentRecord, venueId }, [TOURNAMENT_RECORD, VENUE_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!modifications || typeof modifications !== 'object') return { error: INVALID_OBJECT };

  const appliedPolicies = getAppliedPolicies({
    tournamentRecord,
  })?.appliedPolicies;

  const allowModificationWhenMatchUpsScheduled =
    force ?? appliedPolicies?.[POLICY_TYPE_SCHEDULING]?.allowDeletionWithScoresPresent?.venues;

  const { matchUps: venueMatchUps } = getScheduledVenueMatchUps({
    tournamentRecord,
    venueId,
  });

  const result = findVenue({ tournamentRecord, venueId });
  if (result.error) return result;
  const venue = result.venue;

  const validAttributes = Object.keys(venueTemplate()).filter((attribute) => attribute !== 'venueId');
  const validModificationAttributes = Object.keys(modifications).filter((attribute) =>
    validAttributes.includes(attribute),
  );

  if (!validModificationAttributes.length) return { error: NO_VALID_ATTRIBUTES };

  const validReplacements = new Set(
    validAttributes.filter(
      (attribute) => !['courts', 'onlineResources', 'dateAvailability', 'isPrimary'].includes(attribute),
    ),
  );

  const validReplacementAttributes = Object.keys(modifications).filter((attribute) => validReplacements.has(attribute));

  if (!venue) return { error: VENUE_NOT_FOUND };

  // Validate defaultStartTime/defaultEndTime before applying replacements
  const modStartTime = modifications.defaultStartTime ?? venue.defaultStartTime;
  const modEndTime = modifications.defaultEndTime ?? venue.defaultEndTime;
  if (modStartTime || modEndTime) {
    if (!modStartTime || !modEndTime) {
      return { error: INVALID_VALUES, info: 'both defaultStartTime and defaultEndTime are required' };
    }
    if (!validTimePeriod({ startTime: modStartTime, endTime: modEndTime })) {
      return { error: INVALID_VALUES, info: 'defaultEndTime must be after defaultStartTime' };
    }
  }

  validReplacementAttributes.forEach((attribute) => Object.assign(venue, { [attribute]: modifications[attribute] }));

  // Handle isPrimary modifications
  if ('isPrimary' in modifications) {
    if (modifications.isPrimary) {
      clearPrimaryVenue({ tournamentRecord });
      venue.isPrimary = true;
    } else {
      delete venue.isPrimary;
    }
  }

  // Handle venue dateAvailability modifications
  if (modifications.dateAvailability !== undefined) {
    if (Array.isArray(modifications.dateAvailability) && modifications.dateAvailability.length) {
      const result = validDateAvailability({ dateAvailability: modifications.dateAvailability });
      if (result.error) return result;
    }
    venue.dateAvailability = modifications.dateAvailability;
  }

  // Handle court deletions
  const deletionResult = handleCourtDeletions({
    venue,
    modifications,
    tournamentRecord,
    venueMatchUps,
    allowModificationWhenMatchUpsScheduled,
  });
  if ('error' in deletionResult && deletionResult.error) return deletionResult;

  // Handle court modifications/additions
  const modificationResult = handleCourtModifications({
    modifications,
    tournamentRecord,
    venueMatchUps,
    venueId,
    force,
  });
  if (modificationResult?.error) return modificationResult;

  checkAndUpdateSchedulingProfile({ tournamentRecord });

  if (venue) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue?.venueId,
    });
  }

  return { ...SUCCESS, venue: makeDeepCopy(venue) };
}
