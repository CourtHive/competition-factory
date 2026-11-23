import { getParticipantId } from '@Functions/global/extractors';
import { getPositionAssignments } from './positionsGetter';
import { unique } from '@Tools/arrays';

// constants and types
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, StageTypeUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

// build up an array of participantIds which are assigned positions in structures
// optionally filter to included only specified stages

type GetAssignedParticipantIdsArgs = {
  drawDefinition: DrawDefinition;
  stages?: StageTypeUnion[];
};

export function getAssignedParticipantIds({ drawDefinition, stages }: GetAssignedParticipantIdsArgs): ResultType & {
  assignedParticipantIds?: string[];
} {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const stageStructures = (drawDefinition?.structures ?? []).filter(
    (structure) => !stages?.length || (structure.stage && stages.includes(structure.stage)),
  );
  const assignedParticipantIds = unique(
    stageStructures
      .map((structure) => {
        const { positionAssignments } = getPositionAssignments({
          structure,
        });
        return positionAssignments ? positionAssignments.map(getParticipantId) : [];
      })
      .flat()
      .filter(Boolean),
  );

  return { ...SUCCESS, assignedParticipantIds };
}
