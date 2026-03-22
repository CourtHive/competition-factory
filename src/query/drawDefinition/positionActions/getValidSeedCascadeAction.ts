import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';

// constants and types
import { SEED_CASCADE, SEED_CASCADE_METHOD } from '@Constants/positionActionConstants';
import { DrawDefinition, PositionAssignment, Structure } from '@Types/tournamentTypes';
import { CONTAINER, MAIN } from '@Constants/drawDefinitionConstants';

type GetValidSeedCascadeActionArgs = {
  positionAssignments: PositionAssignment[];
  activeDrawPositions: number[];
  drawDefinition: DrawDefinition;
  structure: Structure;
  drawPosition: number;
  structureId: string;
  isByePosition: boolean;
  drawId: string;
};

/**
 * Returns a SEED_CASCADE action if the draw position contains a seeded
 * participant and a seed withdrawal cascade is valid (MAIN stage,
 * no active matchUps, lower seed blocks with assigned seeds exist).
 */
export function getValidSeedCascadeAction({
  positionAssignments,
  activeDrawPositions,
  drawDefinition,
  isByePosition,
  structure,
  drawPosition,
  structureId,
  drawId,
}: GetValidSeedCascadeActionArgs): { validSeedCascadeAction?: any } {
  // Only MAIN stage sequence 1, non-round-robin
  if (structure.stage !== MAIN || structure.stageSequence !== 1) return {};
  if (structure.structureType === CONTAINER) return {};
  if (isByePosition) return {};

  // No active matchUps allowed
  if (activeDrawPositions.length) return {};

  // Position must have a participant
  const positionAssignment = positionAssignments.find((a) => a.drawPosition === drawPosition);
  if (!positionAssignment?.participantId) return {};

  // Participant must be seeded
  const { seedAssignments } = getStructureSeedAssignments({ drawDefinition, structure });
  if (!seedAssignments?.length) return {};

  const seed = seedAssignments.find((s) => s.participantId === positionAssignment.participantId);
  if (!seed) return {};

  // Check that at least one lower seed block has assigned seeds
  const { validSeedBlocks } = getValidSeedBlocks({ drawDefinition, structure });
  if (!validSeedBlocks?.length) return {};

  const seedBlockIndex = validSeedBlocks.findIndex((block) => block.seedNumbers.includes(seed.seedNumber));
  if (seedBlockIndex < 0 || seedBlockIndex >= validSeedBlocks.length - 1) return {};

  // Check lower blocks for any assigned seeds
  const hasLowerSeeds = validSeedBlocks.slice(seedBlockIndex + 1).some((block) =>
    seedAssignments.some((s) => block.seedNumbers.includes(s.seedNumber) && s.participantId),
  );
  if (!hasLowerSeeds) return {};

  return {
    validSeedCascadeAction: {
      type: SEED_CASCADE,
      method: SEED_CASCADE_METHOD,
      payload: { drawId, structureId, drawPosition },
    },
  };
}
