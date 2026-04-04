import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import courtTemplate from '@Assemblies/generators/templates/courtTemplate';
import { requireParams } from '@Helpers/parameters/requireParams';
import { modifyCourtAvailability } from './courtAvailability';
import { findCourt } from '../../query/venues/findCourt';
import { addNotice } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INVALID_OBJECT, MISSING_TOURNAMENT_RECORDS, NO_VALID_ATTRIBUTES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, COURT_ID } from '@Constants/attributeConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { HydratedMatchUp, HydratedCourt } from '@Types/hydrated';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

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

export function courtModification({
  tournamentRecord,
  disableNotice,
  venueMatchUps,
  modifications,
  courtId,
  force,
}: ModifyCourtArgs): ResultType & { court?: HydratedCourt } {
  const paramsCheck = requireParams({ tournamentRecord, courtId }, [TOURNAMENT_RECORD, COURT_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!modifications || typeof modifications !== 'object') return { error: INVALID_OBJECT };

  const result = findCourt({ tournamentRecord, courtId });
  if (result.error) return result;

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

  if (court)
    validReplacementAttributes.forEach((attribute) => Object.assign(court, { [attribute]: modifications[attribute] }));

  if (modifications.dateAvailability) {
    const result = modifyCourtAvailability({
      dateAvailability: modifications.dateAvailability,
      tournamentRecord: tournamentRecord!,
      venueMatchUps,
      disableNotice,
      courtId,
      force,
    });
    if (result.error) return result;
  }

  if (!disableNotice) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord!.tournamentId },
      topic: MODIFY_VENUE,
      key: venue?.venueId,
    });
  }

  return { ...SUCCESS, court: makeDeepCopy(court) };
}
