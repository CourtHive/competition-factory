import { findResourceCourt, findResourceParticipant, onlineResourceNotice } from './onlineResourceNotices';
import { findOnlineResourceMatchUp, onlineResourceMatchUpNotice } from './onlineResourceMatchUp';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { COURT_NOT_FOUND, NOT_FOUND, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { IDENTIFIER, RESOURCE_SUB_TYPE, RESOURCE_TYPE } from '@Constants/resourceConstants';
import { DrawDefinition, Event, OnlineResource, Tournament } from '@Types/tournamentTypes';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

type RemoveOnlineResourceArgs = {
  onlineResource: OnlineResource; // only identifier, resourceType, resourceSubType
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
export function removeOnlineResource(params: RemoveOnlineResourceArgs) {
  const paramsCheck = checkRequiredParameters(params, [{ tournamentRecord: true, onlineResource: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { tournamentRecord, onlineResource, organisationId, participantId, personId, courtId, venueId, matchUpId } =
    params;

  if (organisationId) {
    if (tournamentRecord.parentOrganisation?.parentOrganisationId !== organisationId) {
      return decorateResult({ result: { error: NOT_FOUND } });
    }
    if (removeResource({ element: tournamentRecord.parentOrganisation, onlineResource }))
      onlineResourceNotice({ tournamentRecord, organisation: true });
  } else if (matchUpId) {
    const { matchUp, error } = findOnlineResourceMatchUp({ drawDefinition: params.drawDefinition, matchUpId });
    if (!matchUp) return decorateResult({ result: { error } });
    removeResource({ element: matchUp, onlineResource });
    onlineResourceMatchUpNotice({ ...params, matchUp, context: 'removeOnlineResource' });
  } else if (participantId || personId) {
    const { participant, element, error } = findResourceParticipant({ tournamentRecord, participantId, personId });
    if (error) return decorateResult({ result: { error } });
    if (removeResource({ element, onlineResource })) onlineResourceNotice({ tournamentRecord, participant });
  } else if (courtId) {
    const { venue, court } = findResourceCourt({ tournamentRecord, courtId, venueId });
    if (!court) return decorateResult({ result: { error: COURT_NOT_FOUND } });
    if (removeResource({ element: court, onlineResource })) onlineResourceNotice({ tournamentRecord, venue });
  } else if (venueId) {
    const venue = (tournamentRecord.venues ?? []).find((v) => v.venueId === venueId);
    if (!venue) return decorateResult({ result: { error: VENUE_NOT_FOUND } });
    if (removeResource({ element: venue, onlineResource })) onlineResourceNotice({ tournamentRecord, venue });
  } else {
    removeResource({ element: tournamentRecord, onlineResource });
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

// true when a resource was removed
function removeResource({ element, onlineResource }): boolean {
  const count = element.onlineResources?.length ?? 0;
  const onlineResources = (element.onlineResources ?? []).filter(
    (resource) =>
      !(
        resource?.[RESOURCE_SUB_TYPE] === onlineResource[RESOURCE_SUB_TYPE] &&
        resource?.[RESOURCE_TYPE] === onlineResource[RESOURCE_TYPE] &&
        resource?.[IDENTIFIER] === onlineResource[IDENTIFIER]
      ),
  );
  element.onlineResources = onlineResources;
  return onlineResources.length !== count;
}
