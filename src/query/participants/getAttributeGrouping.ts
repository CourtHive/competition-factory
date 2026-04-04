import { processAccessors } from '@Query/drawDefinition/processAccessors';
import { unique } from '@Tools/arrays';

// constants and types
import { IdCollections, ResultType } from '@Types/factoryTypes';
import { HydratedParticipant } from '@Types/hydrated';
import {
  MISSING_PARTICIPANT,
  MISSING_PARTICIPANTS,
  MISSING_POLICY_ATTRIBUTES,
} from '@Constants/errorConditionConstants';

/**
 *
 * Each policyAttribute is a string definining how to access the nested participant attribute to be accessed
 * 'person.nationalityCode' targets => { participant: { person: { natinalityCode }}}
 *
 * If an attribute within a policyAttribute definition is an array then the function iterates over members of the array
 * The use case for this behavior is when a participant is a team and contains individualPatticipants: []
 * 'individualParticipants.person.nationalityCode' targets =>
 *  { participant: { individualParticipants: [ { person: { nationalityCode }}, { person: { nationalityCode }}]}}
 */

type GetAttributeGroupingsArgs = {
  participants: HydratedParticipant[];
  targetParticipantIds: string[];
  idCollections?: IdCollections;
  policyAttributes: any;
};
export function getAttributeGroupings({
  targetParticipantIds,
  policyAttributes,
  idCollections,
  participants,
}: GetAttributeGroupingsArgs): ResultType | { [key: string]: string[] } {
  if (!Array.isArray(policyAttributes)) {
    return { error: MISSING_POLICY_ATTRIBUTES };
  }
  if (!Array.isArray(participants)) {
    return { error: MISSING_PARTICIPANTS };
  }
  const groupings = {};
  targetParticipantIds.forEach((participantId) => {
    const participant = participants.find((candidate) => candidate.participantId === participantId);

    const { values } = extractAttributeValues({
      policyAttributes,
      idCollections,
      participants,
      participant,
    });
    if (values) {
      values.forEach((value) => {
        if (!groupings[value]) groupings[value] = [];
        if (!groupings[value].includes(participantId)) {
          groupings[value].push(participantId);
        }
      });
    }
  });

  return groupings;
}

type ExtractAttributeValuesArgs = {
  participants?: HydratedParticipant[];
  participant?: HydratedParticipant;
  idCollections?: IdCollections; // { [directive]: [participantId]}
  policyAttributes: any;
};
export function extractAttributeValues({
  policyAttributes,
  idCollections,
  participants,
  participant,
}: ExtractAttributeValuesArgs) {
  if (!Array.isArray(policyAttributes)) {
    return { error: MISSING_POLICY_ATTRIBUTES };
  }
  if (!participant) {
    return { error: MISSING_PARTICIPANT };
  }
  const extractedValues: string[] = [];
  policyAttributes.forEach((policyAttribute) => {
    const { directive, groupings, key, significantCharacters } = policyAttribute ?? {};

    if (key) {
      const accessors = key.split('.');
      extractedValues.push(
        ...processAccessors({
          significantCharacters,
          value: participant,
          accessors,
        }),
      );
    } else if (directive) {
      // extractedValues are values to be avoided
      // e.g. for { directive: 'pairParticipants' } the extractedValues would be [ 'partnerParticipantId' ]
      const includeIds = policyAttribute?.includeIds;
      const collectionIds = (idCollections?.[directive] ?? []).filter(
        (participantId) => !includeIds || includeIds.includes(participantId),
      );
      if (collectionIds?.length && participants?.length) {
        collectionIds.forEach((collectionParticipantId) => {
          const collectionParticipant = participants.find(
            (participant) => participant.participantId === collectionParticipantId,
          );
          if (collectionParticipant?.individualParticipantIds?.includes(participant.participantId)) {
            const participantId = collectionParticipant?.participantId;
            extractedValues.push(participantId);
          }
        });
      }
    } else if (groupings) {
      Object.keys(groupings).forEach((key) => {
        if (groupings[key].includes(participant.participantId)) {
          extractedValues.push(key);
        }
      });
    }
  });

  const values = unique(extractedValues);
  return { values };
}
