import { attributeFilter } from '@Tools/attributeFilter';

// types
import { HydratedParticipant } from '@Types/hydrated';
import { ParticipantMap } from '@Types/factoryTypes';

type AddIndividualParticipantsArgs = {
  participantMap: ParticipantMap;
  template?: unknown; // an attributeFilter template; isObject() does not narrow it at the caller
};

export function addIndividualParticipants({ participantMap, template }: AddIndividualParticipantsArgs) {
  const participantObjects = Object.values(participantMap);
  for (const participantObject of participantObjects) {
    const participant = participantObject.participant as HydratedParticipant;
    if (participant.individualParticipantIds?.length) {
      participant.individualParticipants = [];
      for (const participantId of participant.individualParticipantIds) {
        const source = participantMap[participantId].participant;
        participant.individualParticipants.push(template ? attributeFilter({ template, source }) : source);
      }
    }
  }
}
