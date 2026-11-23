import { PositionAssignment } from '@Types/tournamentTypes';

export function drawPositionFilled(positionAssignment: PositionAssignment) {
  const containsBye = positionAssignment.bye;
  const containsQualifier = positionAssignment.qualifier;
  const containsParticipant = positionAssignment.participantId;
  const filled = containsBye || containsQualifier || containsParticipant;
  return { containsBye, containsQualifier, containsParticipant, filled };
}
