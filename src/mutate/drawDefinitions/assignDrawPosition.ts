import { assignDrawPositionQualifier as assignPositionQualifier } from '@Mutate/matchUps/drawPositions/assignDrawPositionQualifier';
import { assignDrawPositionBye as assignPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition as assignPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITION,
  MISSING_STRUCTURE_ID,
} from '@Constants/errorConditionConstants';

type AssignDrawPositionArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  participantId?: string;
  drawPosition?: number;
  structureId?: string;
  qualifier?: boolean;
  event?: Event;
  bye?: boolean;
};

export function assignDrawPosition({
  tournamentRecord,
  drawDefinition,
  participantId,
  drawPosition,
  structureId,
  qualifier,
  event,
  bye,
}: AssignDrawPositionArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!drawPosition) return { error: MISSING_DRAW_POSITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };

  if (bye) {
    const result = assignPositionBye({
      tournamentRecord,
      drawDefinition,
      drawPosition,
      structureId,
      event,
    });
    if (result.error) return result;
  } else if (qualifier) {
    const result = assignPositionQualifier({
      tournamentRecord,
      drawDefinition,
      drawPosition,
      structureId,
      event,
    });
    if (result.error) return result;
  } else {
    const result = assignPosition({
      participantId: participantId!,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      structureId,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}
