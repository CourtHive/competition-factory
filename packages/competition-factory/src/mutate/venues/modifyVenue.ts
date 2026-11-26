import { getScheduledCourtMatchUps, getScheduledVenueMatchUps } from '@Query/venues/getScheduledCourtMatchUps';
import { planBulkScheduleTournamentMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleTournamentMatchUps';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { planSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { getSchedulingProfile } from '@Query/scheduling/getSchedulingProfile';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { requireParams } from '@Helpers/parameters/requireParams';
import { deletionMessage } from '@Mutate/venues/deletionMessage';
import { mergedCourtAvailability } from './courtAvailability';
import venueTemplate from '@Helpers/scheduling/venueTemplate';
import courtTemplate from '@Helpers/scheduling/courtTemplate';
import { planCourtModification } from './modifyCourt';
import { canonicalTime } from '@Tools/canonicalClock';
import { addNotice } from '@Global/state/globalState';
import { findVenue } from '@Query/venues/findVenue';
import { modifyVenueNotice } from './venueNotices';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { validTimePeriod } from '@Validators/time';
import { buildCourt } from './addCourt';

// constants and types
import { TOURNAMENT_RECORD, VENUE_ID } from '@Constants/attributeConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { ResultType, TournamentRecords } from '@Types/factoryTypes';
import { Venue, Tournament, Court } from '@Types/tournamentTypes';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  ErrorType,
  COURT_NOT_FOUND,
  INVALID_OBJECT,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VENUE_ID,
  VENUE_NOT_FOUND,
  NO_VALID_ATTRIBUTES,
} from '@Constants/errorConditionConstants';

// courts without a courtId are added rather than modified
type VenueModifications = Omit<Partial<Venue>, 'courts'> & { courts?: Partial<Court>[] };

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

  // every record is planned before any is written: a refusal in a later record leaves the earlier ones as they were.
  // A record that does not hold the venue is passed over (its NOT FOUND suppressed when another record succeeds).
  let error;
  const plans: VenuePlan[] = [];
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = planVenueModify({ tournamentRecord, modifications, venueId, force });
    if ('commit' in result) plans.push(result);
    else {
      if (result.error) error = result.error;
      if (result.error && result.error !== VENUE_NOT_FOUND) return result;
    }
  }

  // the profile across every record, as the per-record repairs leave it
  const views = Object.fromEntries(
    Object.entries(tournamentRecords).map(([tournamentId, record]) => {
      const repaired = plans.find((plan) => plan.tournamentRecord === record)?.repairedProfile;
      return [tournamentId, repaired ? withProfile(record, repaired) : record];
    }),
  );
  const competitionRepair = planProfileRepair({ tournamentRecords: views, targets: tournamentRecords });

  for (const plan of plans) plan.commit();
  competitionRepair?.commit();

  return plans.length ? { ...SUCCESS } : { error };
}

export function venueModify(params: ModifyVenueArgs) {
  const plan = planVenueModify(params);
  if (!('commit' in plan)) return plan;
  plan.commit();
  return { ...SUCCESS, venue: makeDeepCopy(plan.venue) };
}

type VenuePlan = {
  tournamentRecord: Tournament;
  repairedProfile?: unknown[];
  commit: () => void;
  venue: Venue;
};

/**
 * One record's venue edit, decided before anything is written, in the public error order: the parameters, the venue,
 * its editable attributes, paired default times, the date availability, deleting courts (scheduled matchUps, force or
 * policy, and the schedule clears they need), each court modified or added (availability and scheduled conflicts
 * included), and the repair of a scheduling profile left naming what is gone. The commit makes those writes in the
 * order the writer always made them and sends the same notices.
 */
function planVenueModify({ tournamentRecord, modifications, venueId, force }: ModifyVenueArgs): ResultType | VenuePlan {
  const paramsCheck = requireParams({ tournamentRecord, venueId }, [TOURNAMENT_RECORD, VENUE_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!modifications || typeof modifications !== 'object') return { error: INVALID_OBJECT };

  // TS can't narrow after requireParams guard; safe to assert after validation
  const record = tournamentRecord as Tournament;

  const appliedPolicies = getAppliedPolicies({
    tournamentRecord: record,
  })?.appliedPolicies;

  const allowModificationWhenMatchUpsScheduled =
    force ?? appliedPolicies?.[POLICY_TYPE_SCHEDULING]?.allowModificationWhenMatchUpsScheduled?.venues;

  const { matchUps: venueMatchUps } = getScheduledVenueMatchUps({
    tournamentRecord: record,
    venueId,
  });

  const result = findVenue({ tournamentRecord: record, venueId });
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

  const fields: Record<string, unknown> = {};
  for (const attribute of validReplacementAttributes) fields[attribute] = modifications[attribute];
  if (modStartTime) fields.defaultStartTime = canonicalTime(modStartTime);
  if (modEndTime) fields.defaultEndTime = canonicalTime(modEndTime);

  // a venue that loses its primary flag to this one is modified too
  const primary = 'isPrimary' in modifications ? !!modifications.isPrimary : undefined;
  const clearedPrimaryVenues =
    primary === true ? (record.venues ?? []).filter((other) => other.isPrimary && other.venueId !== venueId) : [];

  let dateAvailability: { value: unknown } | undefined;
  if (modifications.dateAvailability !== undefined) {
    if (Array.isArray(modifications.dateAvailability) && modifications.dateAvailability.length) {
      const result = validDateAvailability({ dateAvailability: modifications.dateAvailability });
      if (result.error) return result;
      dateAvailability = { value: result.canonicalAvailability };
    } else {
      dateAvailability = { value: modifications.dateAvailability };
    }
  }

  const deletions = planCourtDeletions({
    allowModificationWhenMatchUpsScheduled,
    tournamentRecord: record,
    venueMatchUps,
    modifications,
    venue,
  });
  if (!('commit' in deletions)) return deletions;

  const courts = planCourtModifications({
    remainingCourts: deletions.remainingCourts ?? venue.courts,
    tournamentRecord: record,
    venueMatchUps,
    modifications,
    venueId,
    force,
  });
  if (!('commit' in courts)) return courts;

  const records = { [record.tournamentId]: record };
  const repair = planProfileRepair({ tournamentRecords: records, targets: records });

  const commit = () => {
    Object.assign(venue, fields);
    for (const cleared of clearedPrimaryVenues) delete cleared.isPrimary;
    if (primary === true) venue.isPrimary = true;
    else if (primary === false) delete venue.isPrimary;
    if (dateAvailability) Object.assign(venue, { dateAvailability: dateAvailability.value });
    deletions.commit();
    courts.commit();
    repair?.commit();
    addNotice({
      payload: { venue, tournamentId: record.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
    for (const cleared of clearedPrimaryVenues) {
      modifyVenueNotice({ tournamentId: record.tournamentId, venue: cleared });
    }
  };

  return { tournamentRecord: record, repairedProfile: repair?.schedulingProfile, venue, commit };
}

/**
 * The courts the edit deletes (those the modified courts do not name; every court when `courts` is empty), refused when
 * they hold scheduled matchUps unless forced or the policy allows it, and the schedule clears they then need, planned
 * as the bulk schedule writer plans them. The commit removes the courts and clears the schedules.
 */
function planCourtDeletions({
  allowModificationWhenMatchUpsScheduled,
  tournamentRecord,
  venueMatchUps,
  modifications,
  venue,
}: {
  allowModificationWhenMatchUpsScheduled?: boolean;
  modifications: VenueModifications;
  venueMatchUps?: HydratedMatchUp[];
  tournamentRecord: Tournament;
  venue: Venue;
}): { error: ErrorType; info?: string } | { commit: () => void; remainingCourts?: Court[] } {
  const existingCourtIds = venue?.courts?.map((court) => court.courtId) ?? [];
  const courtIdsToModify = modifications.courts?.map((court) => court.courtId) ?? [];
  const courtIdsToDelete = courtIdsToModify.length
    ? existingCourtIds.filter((courtId) => !courtIdsToModify.includes(courtId))
    : modifications?.courts && existingCourtIds;

  if (!courtIdsToDelete?.length) return { commit: () => undefined };

  const matchUpsWithCourtId: { matchUpId: string; drawId: string }[] = [];
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
  if (scheduleDeletionsCount && !allowModificationWhenMatchUpsScheduled)
    return deletionMessage({ matchUpsCount: scheduleDeletionsCount });

  const remainingCourts = venue.courts?.filter((court) => courtIdsToModify.includes(court.courtId));
  // the clears are planned now; the batch's own outcome was never the edit's (a locked matchUp keeps its court)
  const { commits } = planBulkScheduleTournamentMatchUps({
    schedule: { courtId: '', scheduledDate: '' },
    matchUpDetails: matchUpsWithCourtId,
    removePriorValues: true,
    tournamentRecord,
  });
  const commit = () => {
    venue.courts = remainingCourts;
    for (const clear of commits) clear();
  };
  return { commit, remainingCourts };
}

/**
 * Each submitted court, in order: an existing court is modified (its attributes and availability), and one the record
 * does not hold is added to the venue, refused when an earlier court of the edit, or a remaining one, holds its id.
 */
function planCourtModifications({
  remainingCourts,
  tournamentRecord,
  venueMatchUps,
  modifications,
  venueId,
  force,
}: {
  venueMatchUps?: HydratedMatchUp[];
  tournamentRecord: Tournament;
  modifications: VenueModifications;
  remainingCourts?: Court[];
  venueId: string;
  force?: boolean;
}): ResultType | { commit: () => void } {
  const commits: (() => void)[] = [];
  const added: Court[] = [];
  for (const court of modifications.courts ?? []) {
    const { courtId } = court ?? {};
    const pendingCourt = courtId ? added.find((candidate) => candidate.courtId === courtId) : undefined;
    if (pendingCourt) {
      // a court added earlier in this edit is modified as the stored court would have been (it is not stored yet)
      const refusal = modifyPendingCourt({ court: pendingCourt, modifications: court });
      if (refusal) return refusal;
      continue;
    }
    const result = planCourtModification({
      // a court without an id is refused by the lookup as before, and then added
      courtId: courtId as string,
      modifications: court,
      disableNotice: true,
      tournamentRecord,
      venueMatchUps,
      force,
    });
    if ('commit' in result) {
      commits.push(result.commit);
      continue;
    }
    if (result?.error !== COURT_NOT_FOUND) return result;
    const { venue } = findVenue({ tournamentRecord, venueId });
    if (!venue) return { error: VENUE_NOT_FOUND };
    const built = buildCourt({ venue: { ...venue, courts: remainingCourts }, venueId, court, pending: added });
    if (built.error || !built.court) return { error: built.error };
    const courtRecord = built.court;
    added.push(courtRecord);
    commits.push(() => {
      venue.courts ??= [];
      venue.courts.push(courtRecord);
    });
  }
  return {
    commit: () => {
      for (const commit of commits) commit();
    },
  };
}

// modifyCourt's edit of a court this edit has only just added: its attributes, then its availability (a new court has no
// scheduled matchUps to conflict with); the court is the planned record, not yet stored
function modifyPendingCourt({ court, modifications }: { court: Court; modifications: Partial<Court> }) {
  const validAttributes = Object.keys(courtTemplate()).filter((attribute) => attribute !== 'courtId');
  const attributes = Object.keys(modifications).filter((attribute) => validAttributes.includes(attribute));
  if (!attributes.length) return { error: NO_VALID_ATTRIBUTES };
  const availability = modifications.dateAvailability && mergedCourtAvailability(modifications.dateAvailability);
  if (availability && 'refusal' in availability) return availability.refusal;
  for (const attribute of attributes)
    if (attribute !== 'dateAvailability') Object.assign(court, { [attribute]: modifications[attribute] });
  if (availability && 'dateAvailability' in availability) court.dateAvailability = availability.dateAvailability;
  return undefined;
}

/**
 * The scheduling profile repair checkAndUpdateSchedulingProfile makes after a venue edit (a round naming a venue, event
 * or draw that is gone), decided against `tournamentRecords` and stored on `targets`. A venue edit adds and removes no
 * venue, event or draw, so the records as they stand decide it. Undefined when nothing needs repair.
 */
function planProfileRepair({
  tournamentRecords,
  targets,
}: {
  tournamentRecords: TournamentRecords;
  targets: TournamentRecords;
}): { schedulingProfile: unknown[]; commit: () => void } | undefined {
  const { schedulingProfile, modifications } = getSchedulingProfile({ tournamentRecords });
  if (!modifications) return undefined;
  const plan = planSchedulingProfile({
    tournamentRecords,
    schedulingProfile,
    storedProfile: schedulingProfile,
    targets,
  });
  return 'commit' in plan ? { schedulingProfile, commit: plan.commit } : undefined;
}

function withProfile(record: Tournament, schedulingProfile: unknown[]): Tournament {
  return { ...record, scheduling: { ...record.scheduling, profile: schedulingProfile } } as Tournament;
}
