import { getPositionAssignments as positionAssignments } from '@Query/drawDefinition/positionsGetter';

// constants and types
import { DrawDefinition, Structure, Tournament } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import {
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

type GetPositionAssignmentsArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  structure?: Structure;
  structureId?: string;
  stage?: string;
};
export function getPositionAssignments({
  tournamentRecord,
  drawDefinition,
  stage = MAIN,
  structureId,
  structure,
}: GetPositionAssignmentsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!structure && !drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (
    !structure &&
    !structureId &&
    drawDefinition?.structures?.filter((structure) => structure.stage === stage).length === 1
  ) {
    structure = drawDefinition.structures.find((structure) => structure.stage === stage);
  }
  if (!structure && !structureId) return { error: MISSING_STRUCTURE_ID };

  const { error, positionAssignments: assignments } = positionAssignments({
    drawDefinition,
    structureId,
    structure,
  });
  return {
    positionAssignments: assignments ?? [],
    structureId: structure?.structureId,
    error,
  };
}
