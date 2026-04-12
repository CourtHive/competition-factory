// Query
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { getQualifiersCount } from './getQualifiersCount';

// Constants
import { CONTAINER, MAIN } from '@Constants/drawDefinitionConstants';

export function getStageDrawPositionsCount({ stage, drawDefinition, stageSequence, tournamentRecord, event }: any) {
  const structures = drawDefinition?.structures?.filter(
    (s: any) => s.stage === stage && (!stageSequence || s.stageSequence === stageSequence),
  );

  if (structures?.length) {
    return structures.reduce((total: number, s: any) => {
      if (s.structureType === CONTAINER) {
        return total + (s.structures?.reduce((sum: number, sub: any) => sum + (sub.positionAssignments?.length ?? 0), 0) ?? 0);
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
