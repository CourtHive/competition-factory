import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { requireParams } from '@Helpers/parameters/requireParams';
import courtTemplate from '@Helpers/scheduling/courtTemplate';
import { planCourtAvailability } from './courtAvailability';
import { addNotice } from '@Global/state/globalState';
import { findCourt } from '@Query/venues/findCourt';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INVALID_OBJECT, MISSING_TOURNAMENT_RECORDS, NO_VALID_ATTRIBUTES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, COURT_ID } from '@Constants/attributeConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { Court, Tournament, Venue } from '@Types/tournamentTypes';
import { HydratedMatchUp, HydratedCourt } from '@Types/hydrated';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyCourtArgs = {
  tournamentRecords?: TournamentRecords;
  venueMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  disableNotice?: boolean;
  modifications: any;
  courtId: string;
  force?: boolean;
};

export function modifyCourt(params: ModifyCourtArgs) {
  const { disableNotice, modifications, courtId, force, venueMatchUps } = params;
  const tournamentRecords = resolveTournamentRecords(params);
  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  let courtModified;

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = courtModification({
      tournamentRecord,
      disableNotice,
      venueMatchUps,
      modifications,
      courtId,
      force,
    });
    if (result?.error) return result;
    courtModified = true;
  }

  return courtModified ? { ...SUCCESS } : undefined;
}

export function courtModification(params: ModifyCourtArgs): ResultType & { court?: HydratedCourt } {
  const plan = planCourtModification(params);
  if (!('commit' in plan)) return plan;
  plan.commit();
  return { ...SUCCESS, court: makeDeepCopy(plan.court) };
}

/**
 * One court's modification, decided without writing it: the court, its editable attributes and any new availability
 * (planCourtAvailability). The commit assigns the attributes, stores the availability and announces the venue (unless
 * `disableNotice`).
 */
export function planCourtModification({
  tournamentRecord,
  disableNotice,
  venueMatchUps,
  modifications,
  courtId,
  force,
}: ModifyCourtArgs): ResultType | { commit: () => void; court?: Court; venue?: Venue } {
  const paramsCheck = requireParams({ tournamentRecord, courtId }, [TOURNAMENT_RECORD, COURT_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!modifications || typeof modifications !== 'object') return { error: INVALID_OBJECT };

  const result = findCourt({ tournamentRecord, courtId });
  if (result.error) return { error: result.error };

  const { venue, court } = result;

  // not valid to modify a courtId
  const validAttributes = Object.keys(courtTemplate()).filter((attribute) => attribute !== 'courtId');

  const validModificationAttributes = Object.keys(modifications).filter((attribute) =>
    validAttributes.includes(attribute),
  );

  if (!validModificationAttributes.length) return { error: NO_VALID_ATTRIBUTES };

  // not valid to replace the dateAvailability array
  const validReplacements = new Set(validAttributes.filter((attribute) => !['dateAvailability'].includes(attribute)));

  const validReplacementAttributes = Object.keys(modifications).filter((attribute) => validReplacements.has(attribute));

  const replacements = Object.fromEntries(
    validReplacementAttributes.map((attribute) => [attribute, modifications[attribute]]),
  );

  let availability: { commit: () => void } | undefined;
  if (modifications.dateAvailability) {
    const result = planCourtAvailability({
      dateAvailability: modifications.dateAvailability,
      tournamentRecord: tournamentRecord!,
      venueMatchUps,
      disableNotice,
      courtId,
      force,
    });
    if (!('commit' in result)) return result;
    availability = result;
  }

  const commit = () => {
    if (court) Object.assign(court, replacements);
    availability?.commit();
    if (!disableNotice) {
      addNotice({
        payload: { venue, tournamentId: tournamentRecord!.tournamentId },
        topic: MODIFY_VENUE,
        key: venue?.venueId,
      });
    }
  };
  return { commit, court, venue };
}
