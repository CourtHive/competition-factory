import { positionParticipantAction } from './positionParticipantAction';

export function alternateDrawPositionAssignment({
  alternateParticipantId,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  structureId,
  event,
}) {
  return positionParticipantAction({
    positionActionName: 'alternateDrawPositionAssignment',
    participantIdAttributeName: 'alternateParticipantid',
    participantId: alternateParticipantId,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    structureId,
    event,
  });
}
