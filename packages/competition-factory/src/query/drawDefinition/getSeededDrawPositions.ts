import { xa } from '@Tools/extractAttributes';
import { chunkArray } from '@Tools/arrays';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';

export function getSeededDrawPositions({ drawDefinition }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const positionAssignments = drawDefinition.structures[0].positionAssignments;
  const pairedDrawPositions = chunkArray(
    positionAssignments.sort((a, b) => a.drawPosition - b.drawPosition).map(xa('drawPosition')),
    2,
  );
  const byeAssignments = positionAssignments.filter(xa('bye')).map(xa('drawPosition'));
  const seedAssignments = drawDefinition.structures[0].seedAssignments;
  const seededDrawPositions = seedAssignments.map(({ participantId, seedNumber }) => {
    const drawPosition = positionAssignments.find((pa) => pa.participantId === participantId).drawPosition;
    const hasBye = pairedDrawPositions
      .find((pair) => pair.includes(drawPosition))
      .some((drawPosition) => byeAssignments.includes(drawPosition));
    return { seedNumber, drawPosition, hasBye };
  });

  return { seededDrawPositions };
}
