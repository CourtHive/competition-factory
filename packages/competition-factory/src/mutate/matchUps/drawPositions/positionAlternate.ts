import { positionParticipantAction } from './positionParticipantAction';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type AlternateDrawPositionAssignmentArgs = {
  alternateParticipantId: string;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
  event?: Event;
};
export function alternateDrawPositionAssignment({
  alternateParticipantId,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  structureId,
  event,
}: AlternateDrawPositionAssignmentArgs) {
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
