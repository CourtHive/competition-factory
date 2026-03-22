import { modifyPositionAssignmentsNotice, modifySeedAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { CONTAINER, MAIN } from '@Constants/drawDefinitionConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type SeedWithdrawalCascadeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureId?: string;
  drawPosition: number;
  event?: Event;
};

/**
 * Cascades seed replacements when a seeded player withdraws after the draw
 * is made but before play begins.
 *
 * One seed from each lower seed block moves up to fill the vacancy:
 * e.g., seed 3 withdraws → seed 5 takes seed 3's position → seed 9 takes
 * seed 5's position → vacancy at seed 9's old draw position.
 *
 * The vacancy left at the end of the chain is returned as `vacatedDrawPosition`
 * for the tournament director to fill with an alternate or BYE.
 */
export function seedWithdrawalCascade({
  tournamentRecord,
  drawDefinition,
  structureId,
  drawPosition,
  event,
}: SeedWithdrawalCascadeArgs): ResultType & { vacatedDrawPosition?: number } {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  structureId = structureId || drawDefinition.structures?.[0]?.structureId;
  if (!structureId) return { error: INVALID_VALUES };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: INVALID_VALUES };

  // Only applies to MAIN stage sequence 1, non-round-robin structures
  if (structure.stage !== MAIN || structure.stageSequence !== 1) {
    return { error: INVALID_VALUES };
  }
  if (structure.structureType === CONTAINER) {
    return { error: INVALID_VALUES };
  }

  // Verify no matchUps are active
  const profileResult = getStructureDrawPositionProfiles({ drawDefinition, structureId });
  if (profileResult.activeDrawPositions?.length) {
    return { error: INVALID_VALUES };
  }

  // Get position and seed assignments
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  if (!positionAssignments) return { error: INVALID_VALUES };

  const { seedAssignments } = getStructureSeedAssignments({ drawDefinition, structure });
  if (!seedAssignments?.length) return { error: INVALID_VALUES };

  // Find the participant at the given drawPosition
  const withdrawnPosition = positionAssignments.find((a) => a.drawPosition === drawPosition);
  const withdrawnParticipantId = withdrawnPosition?.participantId;
  if (!withdrawnParticipantId) return { error: INVALID_VALUES };

  // Find the seed assignment for the withdrawn participant
  const withdrawnSeed = seedAssignments.find((s) => s.participantId === withdrawnParticipantId);
  if (!withdrawnSeed) return { error: INVALID_VALUES };

  // Get seed blocks to determine cascade path
  const { validSeedBlocks } = getValidSeedBlocks({ drawDefinition, structure });
  if (!validSeedBlocks?.length) return { error: INVALID_VALUES };

  // Build a flat list of seed blocks in order: [[1],[2],[3,4],[5,6,7,8],...]
  // getValidSeedBlocks returns SeedBlock { seedNumbers: number[], drawPositions: number[] }
  // Find which block the withdrawn seed belongs to
  const withdrawnSeedNumber = withdrawnSeed.seedNumber;
  const withdrawnBlockIndex = validSeedBlocks.findIndex((block) => block.seedNumbers.includes(withdrawnSeedNumber));
  if (withdrawnBlockIndex < 0) return { error: INVALID_VALUES };

  // Build the cascade chain: one replacement from each lower block
  type CascadeStep = {
    replacementParticipantId: string;
    replacementSeedNumber: number;
    targetSeedNumber: number;
    sourceDrawPosition: number;
    targetDrawPosition: number;
  };

  const cascadeChain: CascadeStep[] = [];
  let currentTargetDrawPosition = drawPosition;
  let currentTargetSeedNumber = withdrawnSeedNumber;

  for (let blockIdx = withdrawnBlockIndex + 1; blockIdx < validSeedBlocks.length; blockIdx++) {
    const lowerBlock = validSeedBlocks[blockIdx];

    // Find assigned seeds in this lower block, sorted by seedNumber ascending
    const blockSeeds = seedAssignments
      .filter((s) => lowerBlock.seedNumbers.includes(s.seedNumber) && s.participantId)
      .sort((a, b) => a.seedNumber - b.seedNumber);

    if (!blockSeeds.length) break; // No more seeds to cascade

    const replacement = blockSeeds[0];
    const replacementPid = replacement.participantId as string; // guaranteed by filter above
    const replacementPosition = positionAssignments.find((a) => a.participantId === replacementPid);
    if (!replacementPosition) break;

    cascadeChain.push({
      replacementParticipantId: replacementPid,
      replacementSeedNumber: replacement.seedNumber,
      targetSeedNumber: currentTargetSeedNumber,
      sourceDrawPosition: replacementPosition.drawPosition,
      targetDrawPosition: currentTargetDrawPosition,
    });

    currentTargetDrawPosition = replacementPosition.drawPosition;
    currentTargetSeedNumber = replacement.seedNumber;
  }

  // Execute the cascade: move participantIds through positions and seed assignments
  for (const step of cascadeChain) {
    // Move participant to the target draw position
    const targetPos = positionAssignments.find((a) => a.drawPosition === step.targetDrawPosition);
    if (targetPos) {
      targetPos.participantId = step.replacementParticipantId;
    }

    // Update seed assignment: the target seed slot gets the replacement's participantId
    const targetSeed = seedAssignments.find((s) => s.seedNumber === step.targetSeedNumber);
    if (targetSeed) {
      targetSeed.participantId = step.replacementParticipantId;
    }
  }

  // Determine the vacated draw position (where the last moved participant came from)
  const vacatedDrawPosition = cascadeChain.length ? cascadeChain.at(-1)?.sourceDrawPosition : drawPosition;

  // Clear the vacated position
  const vacatedPos = positionAssignments.find((a) => a.drawPosition === vacatedDrawPosition);
  if (vacatedPos) {
    vacatedPos.participantId = undefined;
  }

  // Clear the withdrawn seed's seed assignment (if no cascade, clear the withdrawn seed slot)
  if (cascadeChain.length === 0) {
    withdrawnSeed.participantId = undefined;
  } else {
    // The last seed slot in the chain needs to be cleared
    const lastStep = cascadeChain.at(-1);
    const lastSeed = seedAssignments.find((s) => s.seedNumber === lastStep?.replacementSeedNumber);
    if (lastSeed) {
      lastSeed.participantId = undefined;
    }
  }

  // Mark the withdrawn participant as WITHDRAWN in draw entries
  const entry = drawDefinition.entries?.find((e) => e.participantId === withdrawnParticipantId);
  if (entry) {
    entry.entryStatus = WITHDRAWN;
  }

  // Send notifications
  const tournamentId = tournamentRecord?.tournamentId;

  modifyPositionAssignmentsNotice({
    drawDefinition,
    tournamentId,
    structure,
    event,
  });

  modifySeedAssignmentsNotice({
    eventId: event?.eventId,
    drawDefinition,
    tournamentId,
    structure,
  });

  return { ...SUCCESS, vacatedDrawPosition };
}
