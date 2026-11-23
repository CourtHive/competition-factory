import { extractAttributeValues } from '@Query/participants/getAttributeGrouping';

export function getPositionedParticipants({
  candidatePositionAssignments,
  participantsWithGroupings,
  policyAttributes,
  idCollections,
}) {
  const mappedParticipants = Object.assign(
    {},
    ...participantsWithGroupings.map((participant) => ({
      [participant.participantId]: participant,
    })),
  );

  return candidatePositionAssignments.map((assignment) => {
    const participant = mappedParticipants[assignment.participantId];
    const { values } = extractAttributeValues({
      participants: participantsWithGroupings,
      policyAttributes,
      idCollections,
      participant,
    });
    return { ...assignment, values };
  });
}
