import { getParticipants } from '@Query/participants/getParticipants';
import { getParticipantId } from '@Functions/global/extractors';
import { definedAttributes } from '@Tools/definedAttributes';
import { findParticipant } from '@Acquire/findParticipant';
import { addParticipants } from './addParticipants';
import { UUID } from '@Tools/UUID';

// constants and types
import { COMPETITOR, participantRoles } from '@Constants/participantRoles';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_PARTICIPANT_ROLE,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

// add persons to a tournamentRecord and create participants in the process
// include ability to specify a doubles partner by personId
export function addPersons({ participantRole = COMPETITOR, tournamentRecord, persons }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(persons)) return { error: INVALID_VALUES };
  if (!Object.keys(participantRoles).includes(participantRole)) return { error: INVALID_PARTICIPANT_ROLE };

  const existingPersonIds = new Set(
    (tournamentRecord.participants ?? []).map(({ person }) => person?.personId).filter(Boolean),
  );

  const newPersonIds: string[] = [];

  const personsToAdd = persons
    .filter(
      (person) =>
        person &&
        // don't add a person if their personId is present in tournament.participants
        (!person.personId || !existingPersonIds.has(person.personId)),
    )
    .map((person) => {
      person.personId ??= UUID();
      // keep track of all incoming personIds for doubles creation
      newPersonIds.push(person.personId);
      return person;
    });

  // remove top level attributes which are used for participant generation
  const excludeAttributes = (element, attributes) => {
    return Object.assign(
      {},
      ...Object.keys(element)
        .filter((key) => !attributes.includes(key))
        .map((key) => ({ [key]: element[key] })),
    );
  };

  const individualParticipants = personsToAdd.map((person) =>
    definedAttributes({
      extensions: person.participantExtensions,
      timeItems: person.participantTimeItems,
      participantType: INDIVIDUAL,
      participantRole,
      person: excludeAttributes(person, ['participantExtensions', 'participantTimeItems', 'pairedPersons']),
    }),
  );

  let addedPairParticipantsCount = 0;
  let addedIndividualParticipantsCount;

  let result = addParticipants({
    participants: individualParticipants,
    tournamentRecord,
  });
  if (result.error) return result;
  addedIndividualParticipantsCount = result.addedCount || 0;

  const pairParticipants: Participant[] = [];

  const tournamentParticipants =
    getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
      tournamentRecord,
    })?.participants ?? [];

  if (participantRole === COMPETITOR) {
    persons
      .filter(({ pairedPersons }) => pairedPersons)
      .forEach(({ personId, pairedPersons }) => {
        Array.isArray(pairedPersons) &&
          pairedPersons.forEach((pairing) => {
            const individualParticipants = [personId, pairing.personId]
              .map((id) => findParticipant({ tournamentParticipants, personId: id }))
              .filter(Boolean);
            if (individualParticipants.length === 2) {
              const individualParticipantIds = individualParticipants.map(getParticipantId);
              pairParticipants.push(
                definedAttributes({
                  extensions: pairing.participantExtensions,
                  timeItems: pairing.timeItems,
                  participantRole: COMPETITOR,
                  individualParticipantIds,
                  participantType: PAIR,
                }),
              );
            }
          });
      });
  }

  if (pairParticipants.length) {
    result = addParticipants({
      participants: pairParticipants,
      tournamentRecord,
    });
    if (result.error) return result;
    addedPairParticipantsCount = result.addedCount || 0;
  }

  const addedCount = addedIndividualParticipantsCount + addedPairParticipantsCount;

  return { ...SUCCESS, addedCount, newPersonIds };
}
