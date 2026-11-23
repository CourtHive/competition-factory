import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findParticipant } from '@Acquire/findParticipant';

// constants and types
import { PersonRequests, TournamentRecords } from '@Types/factoryTypes';
import { TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { PERSON_REQUESTS } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type SavePersonRequestsArgs = {
  tournamentRecords: TournamentRecords;
  personRequests?: PersonRequests;
};
export function savePersonRequests(params: SavePersonRequestsArgs) {
  const { tournamentRecords, personRequests } = params;
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true }]);
  if (paramsCheck.error) return paramsCheck;
  if (!personRequests) return { ...SUCCESS };

  const tournaments = Object.values(tournamentRecords);
  for (const tournamentRecord of tournaments) {
    const tournamentParticipants = tournamentRecord.participants ?? [];
    const relevantPersonRequests: { personId: string; requests: PersonRequests[string] }[] = [];
    for (const personId of Object.keys(personRequests)) {
      if (findParticipant({ tournamentParticipants, personId })) {
        const requests = personRequests[personId];
        if (requests.length) relevantPersonRequests.push({ personId, requests });
      }
    }

    if (Object.keys(relevantPersonRequests).length) {
      const extension = {
        value: relevantPersonRequests,
        name: PERSON_REQUESTS,
      };
      addExtension({ element: tournamentRecord, extension });
    }
  }

  return { ...SUCCESS };
}
