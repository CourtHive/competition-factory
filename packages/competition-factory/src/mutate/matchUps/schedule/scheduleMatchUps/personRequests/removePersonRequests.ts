import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { savePersonRequests } from './savePersonRequests';

// constants and types
import { TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { PERSON_REQUESTS } from '@Constants/extensionConstants';
import { TournamentRecords } from '@Types/factoryTypes';

// personRequests can be removed by date, requestId, or requestType
type RemovePersonRequests = {
  tournamentRecords: TournamentRecords;
  requestType?: string;
  requestId?: string;
  personId?: string;
  date?: string;
};
export function removePersonRequests(params: RemovePersonRequests) {
  const { tournamentRecords, requestType, requestId, personId, date } = params;
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { personRequests } = getPersonRequests({ tournamentRecords });
  const filterRequests = (personId) => {
    if (personRequests) {
      personRequests[personId] = personRequests[personId].filter((request) => {
        return (
          (!requestType || request.requestType !== requestType) &&
          (!requestId || request.requestId !== requestId) &&
          (!date || request.date !== date)
        );
      });

      if (!personRequests?.[personId]?.length) delete personRequests[personId];
    }
  };

  const removeAll = !requestType && !requestId && !personId && !date;

  if (!removeAll) {
    if (personId && personRequests?.[personId]) {
      filterRequests(personId);
    } else if (personRequests) {
      for (const personId of Object.keys(personRequests)) {
        filterRequests(personId);
      }
    }
  }

  if (removeAll || !personRequests || !Object.keys(personRequests).length) {
    return removeExtension({
      name: PERSON_REQUESTS,
      tournamentRecords,
      discover: true,
    });
  } else {
    return savePersonRequests({ tournamentRecords, personRequests });
  }
}
