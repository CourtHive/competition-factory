import { assignDrawPositionQualifier as assignPositionQualifier } from '@Mutate/matchUps/drawPositions/assignDrawPositionQualifier';
import { assignDrawPosition as assignPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { dueParticipantRefusal, reservedSeatRefusal } from '@Query/drawDefinition/positionActionRefusal';
import { assignDrawPositionBye as assignPositionBye } from './assignDrawPositionBye';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';

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

  // a seat a matchUp not yet decided still owes is not given a participant by hand where its arrival would then be
  // refused (a BYE is asked by its own planner; a qualifier's seat is filled by its own action)
  if (!qualifier && !bye) {
    const reserved = reservedSeatRefusal({
      inContextDrawMatchUps: () => getAllDrawMatchUps({ inContext: true, drawDefinition }).matchUps ?? [],
      stack: 'assignDrawPosition',
      placing: 'PARTICIPANT',
      drawDefinition,
      drawPosition,
      structureId,
    });
    if (reserved) return reserved;
    const due = dueParticipantRefusal({
      inContextDrawMatchUps: () => getAllDrawMatchUps({ inContext: true, drawDefinition }).matchUps ?? [],
      stack: 'assignDrawPosition',
      drawDefinition,
      participantId,
      structureId,
    });
    if (due) return due;
  }

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
