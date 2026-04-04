import { filterParticipants } from '../participants/filterParticipants';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

export function getTournamentPersons({ tournamentRecord, participantFilters }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  let tournamentParticipants = tournamentRecord.participants ?? [];

  if (participantFilters)
    tournamentParticipants = filterParticipants({
      participants: tournamentParticipants,
      participantFilters,
      tournamentRecord,
    });

  const tournamentPersons = {};

  const extractPerson = (participant) => {
    if (participant.person) {
      const { personId } = participant.person;
      if (tournamentPersons[personId]) {
        // case where personId is used for multiple participants, e.g. COMPETITOR as well as OFFICIAL
        tournamentPersons[personId].participantIds.push(participant.participantId);
      } else {
        tournamentPersons[personId] = {
          ...participant.person,
          participantIds: [participant.participantId],
        };
      }
    }
  };

  tournamentParticipants.forEach((participant) => {
    if (participant.person) extractPerson(participant);
  });

  return { tournamentPersons: Object.values(tournamentPersons) };
}
