import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { positionParticipantAction } from './positionParticipantAction';

type LuckyLoserDrawPositionAssignmentArgs = {
  luckyLoserParticipantId?: string;
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  drawPosition?: number;
  structureId?: string;
};
export function luckyLoserDrawPositionAssignment({
  luckyLoserParticipantId,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  structureId,
}: LuckyLoserDrawPositionAssignmentArgs) {
  return positionParticipantAction({
    positionActionName: 'luckyLoserDrawPositionAssignment',
    participantId: luckyLoserParticipantId,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    structureId,
  });
}
