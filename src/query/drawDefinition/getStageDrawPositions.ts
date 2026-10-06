// Query
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { getQualifiersCount } from './getQualifiersCount';

// constants
import { CONTAINER, MAIN } from '@Constants/drawDefinitionConstants';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type GetStageDrawPositionsCountArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  stageSequence?: number;
  stage?: string;
  event?: Event;
};

export function getStageDrawPositionsCount({
  stage,
  drawDefinition,
  stageSequence,
  tournamentRecord,
  event,
}: GetStageDrawPositionsCountArgs) {
  const structures = drawDefinition?.structures?.filter(
    (s) => s.stage === stage && (!stageSequence || s.stageSequence === stageSequence),
  );

  if (structures?.length) {
    return structures.reduce((total: number, s) => {
      if (s.structureType === CONTAINER) {
        return (
          total + (s.structures?.reduce((sum: number, sub) => sum + (positionAssignmentsOf(sub)?.length ?? 0), 0) ?? 0)
        );
      }
      return total + (s.positionAssignments?.length ?? 0);
    }, 0);
  }

  // No structures yet — check sanctioning constraints for MAIN draw size
  if (stage === MAIN && tournamentRecord) {
    const { constraints } = getDrawCompositionConstraints({ tournamentRecord, event });
    if (constraints?.drawSize) return constraints.drawSize;
  }

  return 0;
}

// drawSize - qualifyingPositions
export function getStageDrawPositionsAvailable(params: any) {
  const { provisionalPositioning, drawDefinition, stageSequence, stage, tournamentRecord, event } = params;
  const drawSize = getStageDrawPositionsCount({ stage, drawDefinition, stageSequence, tournamentRecord, event });

  // Find the structureId for the target stage so getQualifiersCount can derive from links
  const targetStructure = drawDefinition?.structures?.find(
    (s: any) => s.stage === stage && (!stageSequence || s.stageSequence === stageSequence),
  );

  const { qualifiersCount } = getQualifiersCount({
    structureId: targetStructure?.structureId,
    provisionalPositioning,
    drawDefinition,
    stageSequence,
    stage,
  });
  return drawSize && drawSize - (qualifiersCount ?? 0);
}
