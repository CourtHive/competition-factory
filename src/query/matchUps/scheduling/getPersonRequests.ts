import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { findExtension } from '@Acquire/findExtension';

import { TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { PERSON_REQUESTS } from '@Constants/extensionConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { PersonRequests } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetPersonRequestsArgs = {
  tournamentRecords: { [key: string]: Tournament };
  requestType?: string;
};
export function getPersonRequests(params: GetPersonRequestsArgs): {
  personRequests?: PersonRequests;
  error?: ErrorType;
} {
  const { tournamentRecords, requestType } = params;

  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const personRequests: PersonRequests = {};

  // create merged view of person requests across tournamentRecords
  // ... possible for a person to be in multiple linked tournamentRecords
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const { extension } = findExtension({
      element: tournamentRecord,
      name: PERSON_REQUESTS,
    });

    const requestObjects = extension?.value ?? [];

    for (const requestObject of requestObjects) {
      const { personId, requests } = requestObject ?? {};

      if (!personRequests[personId]) personRequests[personId] = [];
      for (const request of requests) {
        if (requestType && request.requestType !== requestType) continue;

        personRequests[personId].push(request);
      }
    }
  }

  // audit requests and filter out any that are no longer relevant
  // (tournament dates changed & etc)

  return { personRequests, ...SUCCESS };
}
