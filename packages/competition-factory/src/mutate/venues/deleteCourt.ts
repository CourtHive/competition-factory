import { planCourtAssignmentRemoval } from '@Mutate/matchUps/schedule/removeCourtAssignment';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getScheduledCourtMatchUps } from '@Query/venues/getScheduledCourtMatchUps';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { deletionMessage } from '@Mutate/venues/deletionMessage';
import { addNotice } from '@Global/state/globalState';
import { findCourt } from '@Query/venues/findCourt';
import { bulkItem } from '@Mutate/bulkItem';

// constants and types
import { COURT_ID, TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import {
  COURT_NOT_FOUND,
  ErrorType,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

type DeleteCourtArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  disableNotice?: boolean;
  courtId: string;
  force?: boolean;
};
export function deleteCourt(params: DeleteCourtArgs) {
  const { courtId, disableNotice, force } = params;
  const tournamentRecords = resolveTournamentRecords(params);
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true, [COURT_ID]: true }]);
  if (paramsCheck.error) return paramsCheck;

  // the court is planned in every record before it is deleted from any: a refusal in a later record leaves the earlier
  // ones as they were; a record that does not hold the court is passed over, as before
  let commits: (() => void)[] | undefined;
  let result;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    result = planCourtDeletion({ tournamentRecord, disableNotice, courtId, force });
    if (result.error) {
      if (result.error !== COURT_NOT_FOUND) return result;
    } else (commits ??= []).push(result.commit);
  }
  if (!commits) return result;
  for (const commit of commits) commit();
  return { ...SUCCESS };
}

type CourtDeletionArgs = {
  tournamentRecord: Tournament;
  disableNotice?: boolean;
  courtId: string;
  force?: boolean;
};

export function courtDeletion(params: CourtDeletionArgs): { success?: boolean; error?: ErrorType; info?: unknown } {
  const plan = planCourtDeletion(params);
  if (!('commit' in plan)) return plan;
  plan.commit();
  return { ...SUCCESS };
}

type CourtDeletionRefusal = { error: ErrorType; info?: unknown };

/**
 * One court deletion, decided before anything is written: the court and its venue, the matchUps scheduled on it, the
 * force or policy that permits removing them, and each matchUp's court assignment. The commit removes those
 * assignments, removes the court from its venue and announces them, with no lookup or policy decision left in it.
 */
export function planCourtDeletion({
  tournamentRecord,
  disableNotice,
  courtId,
  force,
}: CourtDeletionArgs): CourtDeletionRefusal | { commit: () => void; error?: undefined } {
  const result = findCourt({ tournamentRecord, courtId });
  if (result.error) return result as CourtDeletionRefusal;
  const venue = result.venue;

  const { matchUps } = getScheduledCourtMatchUps({
    tournamentRecord,
    courtId,
  });

  const appliedPolicies = getAppliedPolicies({
    tournamentRecord,
  })?.appliedPolicies;

  const allowModificationWhenMatchUpsScheduled =
    force ?? appliedPolicies?.[POLICY_TYPE_SCHEDULING]?.allowModificationWhenMatchUpsScheduled?.courts;

  if (matchUps?.length && !allowModificationWhenMatchUpsScheduled)
    return deletionMessage({ matchUpsCount: matchUps.length });

  const removals: (() => void)[] = [];
  for (const matchUp of matchUps ?? []) {
    const removal = planCourtAssignmentRemoval({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      tournamentRecord,
    });
    if (!('commit' in removal)) return removal;
    removals.push(removal.commit);
  }

  const courts = venue && (venue.courts ?? []).filter((courtRecord) => courtRecord.courtId !== courtId);

  const commit = () => {
    for (const removal of removals) removal();
    if (venue) {
      venue.courts = courts;
      if (!disableNotice)
        addNotice({
          payload: { venue, tournamentId: tournamentRecord.tournamentId },
          topic: MODIFY_VENUE,
          key: venue.venueId,
        });
    }
  };
  return { commit };
}

type DeleteCourtsArgs = {
  tournamentRecord?: Tournament;
  courtIds: string[];
  force?: boolean;
};

type CourtDeletionItem = { index: number; courtId: string; success?: boolean; error?: ErrorType; info?: unknown };

/**
 * A bulk deletion: each court is planned against what the courts before it left and committed on its own (ruling 7).
 * A refused court leaves the record as it found it, and the courts after it are still deleted. `results` holds one
 * entry per courtId, in order; the first refusal is also returned at the top level, as before, with `committed: true`
 * when any court was deleted, so the engine announces what was (ruling 33, see engines/parts/partialCommit).
 */
export function deleteCourts(params: DeleteCourtsArgs): {
  results?: CourtDeletionItem[];
  committed?: boolean;
  success?: boolean;
  error?: ErrorType;
  info?: unknown;
} {
  const { tournamentRecord, courtIds, force } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(courtIds)) return { error: INVALID_VALUES };

  const results: CourtDeletionItem[] = [];
  let refusal: CourtDeletionRefusal | undefined;
  for (const [index, courtId] of courtIds.entries()) {
    const result = bulkItem(() => courtDeletion({ tournamentRecord, courtId, force }));
    if (result.error) {
      refusal ??= result as CourtDeletionRefusal;
      results.push({ index, courtId, error: result.error, ...(result.info !== undefined && { info: result.info }) });
    } else {
      results.push({ index, courtId, success: true });
    }
  }

  if (!refusal) return { ...SUCCESS, results };
  const committed = results.some((item) => item.success);
  return { ...refusal, results, ...(committed && { committed }) };
}
