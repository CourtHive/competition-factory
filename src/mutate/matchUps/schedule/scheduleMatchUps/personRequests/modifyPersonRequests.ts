import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { canonicalRequest, ClockRequest } from './canonicalRequest';
import { mergePersonRequests } from './mergePersonRequests';
import { savePersonRequests } from './savePersonRequests';

// constants
import { ARRAY, INVALID, OF_TYPE, TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

// can be used to both add and remove requests
// requests which don't have existing requestId will be added
// requests which don't have requestType will be removed
export function modifyPersonRequests(params) {
  const { tournamentRecords, requests, personId } = params;
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORDS]: true },
    { requests: true, [OF_TYPE]: ARRAY, [INVALID]: INVALID_VALUES },
  ]);
  if (paramsCheck.error) return paramsCheck;

  // a request carrying a date or a time that is not one refuses the call before anything is changed (§ 9.9)
  const canonical = (requests as unknown[]).map(canonicalRequest);
  if (canonical.some(({ valid }) => !valid)) return { error: INVALID_VALUES, info: 'invalid date or time' };
  const canonicalRequests = canonical.map(({ request }) => request as ClockRequest);

  const requestIds = canonicalRequests.map(({ requestId }) => requestId).filter(Boolean);

  const { personRequests } = getPersonRequests({ tournamentRecords });
  const modifyRequests = (personId) => {
    if (personRequests) {
      personRequests[personId] = personRequests[personId].flatMap((request) => {
        // if requestId not in requestIds then return unmodified
        if (!requestIds.includes(request.requestId)) return [request];

        // find the updatedRequest
        const modification = canonicalRequests.find((updatedRequest) => updatedRequest.requestId === request.requestId);
        // FEATURE: returning an updatedRequest without a requestType will remove it
        if (!modification?.requestType) return [];

        return [Object.assign(request, modification)];
      });
    }
  };
  if (personId && personRequests?.[personId]) {
    modifyRequests(personId);
  } else if (personRequests) {
    for (const personId of Object.keys(personRequests)) {
      modifyRequests(personId);
    }
  }

  const newRequests = canonicalRequests.filter((request) => !request.requestId);
  if (newRequests.length) {
    mergePersonRequests({ personRequests, personId, requests: newRequests });
  }

  return savePersonRequests({ tournamentRecords, personRequests });
}
