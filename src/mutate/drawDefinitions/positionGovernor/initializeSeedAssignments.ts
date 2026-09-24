import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getSeedGroups } from '@Query/drawDefinition/getSeedBlocks';
import { getSeedsCount } from '@Query/drawDefinition/getSeedsCount';
import { findStructure } from '@Acquire/findStructure';
import { isConvertableInteger } from '@Tools/math';
import { generateRange } from '@Tools/arrays';

// constants and types
import { ErrorType, SEEDSCOUNT_GREATER_THAN_DRAW_SIZE, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { PolicyDefinitions, SeedingProfile } from '@Types/factoryTypes';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type InitializeStructureSeedAssignmentsArgs = {
  appliedPolicies?: PolicyDefinitions;
  requireParticipantCount?: boolean;
  enforcePolicyLimits?: boolean;
  drawSizeProgression?: boolean;
  seedingProfile?: SeedingProfile;
  drawDefinition: DrawDefinition;
  participantsCount?: number;
  participantCount?: number;
  structureId: string;
  seedsCount: number;
};
export function initializeStructureSeedAssignments({
  requireParticipantCount = true,
  enforcePolicyLimits = true,
  drawSizeProgression,
  participantsCount,
  participantCount,
  appliedPolicies,
  drawDefinition,
  seedingProfile,
  structureId,
  seedsCount,
}: InitializeStructureSeedAssignmentsArgs): {
  seedLimit?: number;
  success?: boolean;
  error?: ErrorType;
} {
  participantsCount = participantsCount ?? participantCount;
  const result = findStructure({ drawDefinition, structureId });
  if (result.error) return result;
  const structure = result.structure;
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const drawSize = positionAssignments?.length || 0;

  if (seedsCount > drawSize) return { error: SEEDSCOUNT_GREATER_THAN_DRAW_SIZE };

  const roundRobinGroupsCount = structure.structures?.length;
  const groupSeedingThreshold =
    isConvertableInteger(seedingProfile?.groupSeedingThreshold) && seedingProfile?.groupSeedingThreshold;

  const seedGroups = getSeedGroups({
    roundRobinGroupsCount,
    drawSize,
  })?.seedGroups;

  const { seedsCount: maxSeedsCount, additionalSeedsAllowed = 0 } = getSeedsCount({
    policyDefinitions: appliedPolicies,
    requireParticipantCount,
    drawSizeProgression,
    participantsCount,
    drawSize,
  });

  // The policy ceiling is the threshold count PLUS whatever the policy allows above it. A body
  // that protects a returning player permits, say, 32 + 4 in a 128 draw; clamping to 32 would
  // refuse the protection the policy exists to grant. `additionalSeedsAllowed` is 0 unless a
  // policy declares it, so an unchanged policy clamps exactly where it always did.
  const policyCeiling = maxSeedsCount ? maxSeedsCount + additionalSeedsAllowed : 0;

  if (policyCeiling && appliedPolicies?.[POLICY_TYPE_SEEDING] && seedsCount > policyCeiling && enforcePolicyLimits) {
    seedsCount = policyCeiling;
  }

  structure.seedLimit = seedsCount;
  structure.seedAssignments = generateRange(1, seedsCount + 1).map((seedNumber) => {
    const seedGroup = seedGroups?.find((seedGroup) => seedGroup.includes(seedNumber));
    const groupSeedValue = seedGroup && Math.min(...seedGroup);
    const seedValue = groupSeedingThreshold && seedNumber >= groupSeedingThreshold ? groupSeedValue : seedNumber;

    return {
      participantId: undefined,
      seedNumber,
      seedValue,
    };
  });

  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });

  return { ...SUCCESS, seedLimit: seedsCount };
}
