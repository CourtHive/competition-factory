import { positionParticipantAction } from './positionParticipantAction';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';

type QualifierDrawPositionAssignmentArgs = {
  qualifyingParticipantId: string;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
};
/**
 * Places a qualifier at a drawPosition. A seat reserved for a qualifier keeps `qualifier: true` when the qualifier is
 * placed: the flag marks the participant as a qualifier (e.g. for a 'Q' beside the name). Clearing the position
 * removes it (positionClear); swapping positions moves it with the qualifier (positionSwap).
 */
export function qualifierDrawPositionAssignment({
  qualifyingParticipantId,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  structureId,
}: QualifierDrawPositionAssignmentArgs) {
  return positionParticipantAction({
    positionActionName: 'qualifierDrawPositionAssignment',
    participantId: qualifyingParticipantId,
    isQualifierPosition: true,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    structureId,
  });
}
