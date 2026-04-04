import { getParticipantId } from '@Functions/global/extractors';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, MISSING_POSITION_ASSIGNMENTS } from '@Constants/errorConditionConstants';
import { DrawDefinition, PositionAssignment, Structure } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

export function getAllPositionedParticipantIds({ drawDefinition }): ResultType & {
  allPositionedParticipantIds?: string[];
  stagePositionedParticipantIds?: { [key: string]: string[] };
} {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const stagePositionedParticipantIds = {};

  const allPositionedParticipantIds = (drawDefinition.structures ?? [])
    .map((structure) => {
      const stage = structure.stage;
      if (!stagePositionedParticipantIds[stage]) stagePositionedParticipantIds[stage] = [];
      const { positionAssignments } = getPositionAssignments({ structure });
      const particiapntIds = positionAssignments?.map(getParticipantId).filter(Boolean) ?? [];
      stagePositionedParticipantIds[stage].push(...particiapntIds);
      return particiapntIds;
    })
    .flat();
  return { allPositionedParticipantIds, stagePositionedParticipantIds };
}

type GetPositionAssignmentsArgs = {
  structureId?: string;
  drawDefinition?: any;
  structure?: any;
};

export function getPositionAssignments({ drawDefinition, structureId, structure }: GetPositionAssignmentsArgs): {
  positionAssignments: PositionAssignment[];
  error?: ErrorType;
} {
  let error: any,
    positionAssignments: PositionAssignment[] = [];
  if (!structure) {
    if (!drawDefinition) {
      return { positionAssignments, error: MISSING_DRAW_DEFINITION };
    }
    ({ structure, error } = findStructure({ drawDefinition, structureId }));
    if (error) return { positionAssignments, error };
  }

  if (structure.structures) {
    positionAssignments = [].concat(
      ...structure.structures.map((structure) => {
        return getPositionAssignments({ structure }).positionAssignments;
      }),
    );
  } else if (structure.positionAssignments) {
    positionAssignments = structure.positionAssignments;
  } else {
    error = MISSING_POSITION_ASSIGNMENTS;
  }

  return { positionAssignments, error };
}

type StructureAssignedDrawPositionsArgs = {
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  structureId?: string;
};
export function structureAssignedDrawPositions({
  drawDefinition,
  structureId,
  structure,
}: StructureAssignedDrawPositionsArgs): {
  positionAssignments: PositionAssignment[];
  allPositionsAssigned?: boolean;
  unassignedPositions;
  assignedPositions;
  qualifierPositions;
  byePositions;
} {
  const positionAssignments =
    getPositionAssignments({
      drawDefinition,
      structureId,
      structure,
    })?.positionAssignments ?? [];
  const assignedPositions = positionAssignments?.filter((assignment) => {
    return assignment.participantId ?? assignment.bye ?? assignment.qualifier;
  });
  const allPositionsAssigned = positionAssignments && positionAssignments?.length === assignedPositions?.length;
  const unassignedPositions = positionAssignments?.filter((assignment) => {
    return !assignment.participantId && !assignment.bye && !assignment.qualifier;
  });
  const byePositions = positionAssignments?.filter((assignment) => {
    return !assignment.participantId && assignment.bye;
  });
  const qualifierPositions = positionAssignments?.filter((assignment) => {
    return !assignment.participantId && assignment.qualifier;
  });

  return {
    allPositionsAssigned,
    positionAssignments,
    unassignedPositions,
    assignedPositions,
    qualifierPositions,
    byePositions,
  };
}
