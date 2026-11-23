import { PositionAssignment } from '@Types/tournamentTypes';

type GetUnplaced = {
  positionAssignments: PositionAssignment[];
  participantIds: string[];
};

export function getUnplacedParticipantIds({ positionAssignments, participantIds }: GetUnplaced) {
  const assignedParticipantIds = positionAssignments.map((assignment) => assignment.participantId);
  return participantIds.filter((participantId) => !assignedParticipantIds.includes(participantId));
}
