import { Substitution } from '@Types/factoryTypes';

export function getCollectionPositionAssignments({ collectionPosition, collectionId, lineUp }): {
  assignedParticipantIds: string[];
  substitutions: Substitution[];
} {
  let assignedParticipantIds: string[] = [];
  const substitutions: Substitution[] = [];

  if (lineUp) {
    const getOrderValue = (order) => (order === undefined ? -1 : order);
    const competitorAssignments = lineUp
      .map((teamCompetitor) => {
        const { collectionAssignments, participantId } = teamCompetitor;
        const assignment = collectionAssignments?.find(
          (assignment) =>
            assignment.collectionPosition === collectionPosition && assignment.collectionId === collectionId,
        );
        return assignment && { participantId, ...assignment };
      })
      .filter(Boolean)
      .sort((a, b) => getOrderValue(a.substitutionOrder) - getOrderValue(b.substitutionOrder));

    for (const competitorAssignment of competitorAssignments) {
      const { participantId, previousParticipantId, substitutionOrder } = competitorAssignment;
      if (assignedParticipantIds.includes(participantId)) continue;
      if (previousParticipantId)
        substitutions.push({
          previousParticipantId,
          substitutionOrder,
          participantId,
        });
      assignedParticipantIds = assignedParticipantIds.filter((id) => id !== previousParticipantId);
      assignedParticipantIds.push(participantId);
    }
  }

  return { assignedParticipantIds, substitutions };
}
