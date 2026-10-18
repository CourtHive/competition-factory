import { findResourceCourt, findResourceParticipant, onlineResourceNotice } from './onlineResourceNotices';
import { findOnlineResourceMatchUp, onlineResourceMatchUpNotice } from './onlineResourceMatchUp';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { COURT_NOT_FOUND, INVALID_PARTICIPANT, NOT_FOUND, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, OnlineResource, Tournament } from '@Types/tournamentTypes';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { IDENTIFIER, NAME } from '@Constants/resourceConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type AddOnlineResourceArgs = {
  onlineResource: OnlineResource;
  drawDefinition?: DrawDefinition;
  tournamentRecord: Tournament;
  organisationId?: string;
  participantId?: string;
  personId?: string;
  matchUpId?: string;
  courtId?: string;
  venueId?: string;
  event?: Event;
};

export function addOnlineResource(params: AddOnlineResourceArgs): ResultType {
  const paramsCheck = checkRequiredParameters(params, [{ tournamentRecord: true, onlineResource: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { tournamentRecord, onlineResource, organisationId, participantId, personId, courtId, venueId, matchUpId } =
    params;

  if (organisationId) {
    if (tournamentRecord.parentOrganisation?.parentOrganisationId !== organisationId) {
      return decorateResult({ result: { error: NOT_FOUND } });
    }
    if (mergeResource({ element: tournamentRecord.parentOrganisation, onlineResource }))
      onlineResourceNotice({ tournamentRecord, organisation: true });
  } else if (matchUpId) {
    const { matchUp, error } = findOnlineResourceMatchUp({ drawDefinition: params.drawDefinition, matchUpId });
    if (!matchUp) return decorateResult({ result: { error } });
    mergeResource({ element: matchUp, onlineResource });
    onlineResourceMatchUpNotice({ ...params, matchUp, context: 'addOnlineResource' });
  } else if (participantId && personId && participantId !== personId) {
    return decorateResult({ result: { error: INVALID_PARTICIPANT } });
  } else if (participantId || personId) {
    const { participant, element, error } = findResourceParticipant({ tournamentRecord, participantId, personId });
    if (error) return decorateResult({ result: { error } });
    if (mergeResource({ element, onlineResource })) onlineResourceNotice({ tournamentRecord, participant });
  } else if (courtId) {
    const { venue, court } = findResourceCourt({ tournamentRecord, courtId, venueId });
    if (!court) return decorateResult({ result: { error: COURT_NOT_FOUND } });
    if (mergeResource({ element: court, onlineResource })) onlineResourceNotice({ tournamentRecord, venue });
  } else if (venueId) {
    const venue = (tournamentRecord.venues ?? []).find((v) => v.venueId === venueId);
    if (!venue) return decorateResult({ result: { error: VENUE_NOT_FOUND } });
    if (mergeResource({ element: venue, onlineResource })) onlineResourceNotice({ tournamentRecord, venue });
  } else {
    mergeResource({ element: tournamentRecord, onlineResource });
    addNotice({
      payload: {
        parentOrganisation: tournamentRecord.parentOrganisation,
        onlineResources: tournamentRecord.onlineResources,
        tournamentId: tournamentRecord.tournamentId,
      },
      topic: MODIFY_TOURNAMENT_DETAIL,
    });
  }

  return { ...SUCCESS };
}

// true when the element's resources changed: re-adding a resource it already holds changes nothing
function mergeResource({ element, onlineResource }: { element: any; onlineResource: OnlineResource }): boolean {
  const before = JSON.stringify(element.onlineResources ?? []);
  const onlineResources = (element.onlineResources ?? []).filter(
    (resource) => resource?.[NAME] !== onlineResource[NAME] && resource?.[IDENTIFIER] !== onlineResource[IDENTIFIER],
  );
  onlineResources.push(onlineResource);

  element.onlineResources = onlineResources;

  return JSON.stringify(onlineResources) !== before;
}
