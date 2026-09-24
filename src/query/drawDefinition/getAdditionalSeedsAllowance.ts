import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { getSeedsCount } from '@Query/drawDefinition/getSeedsCount';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, SeedingBasisUnion, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

type GetAdditionalSeedsAllowanceArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  participantsCount?: number;
  structureId: string;
  event?: Event;
};

export type AdditionalSeedsAllowanceResult = {
  /** Bases the policy permits to claim an additional seed; undefined means any. */
  bases?: SeedingBasisUnion[];
  /** Additional seeds the policy permits above `thresholdSeedsCount`. */
  additionalSeedsAllowed: number;
  /** How many of that allowance the structure has already taken. */
  additionalSeedsAssigned: number;
  /** What is left — what a client should offer, and what `addAdditionalSeed` will accept. */
  additionalSeedsRemaining: number;
  /** The seed count the policy's thresholds yield on their own. */
  thresholdSeedsCount: number;
  /** The structure's current seed count. */
  seedLimit: number;
  drawSize: number;
};

/**
 * What a seeding policy permits ABOVE its threshold count, and how much of that a structure has
 * already used.
 *
 * Read this to decide whether one more seed may be added, and to build a control that says so.
 * `addAdditionalSeed` applies the same arithmetic, so a client that reads this and a server that
 * writes cannot disagree about the ceiling.
 *
 * **`participantsCount` defaults to the number of positions holding something other than a BYE.**
 * Threshold rows match on `minimumParticipantCount`, so this has to be an entry count rather than
 * a draw size — and a structure that has been positioned already carries the honest number in its
 * own assignments. Pass it explicitly where a stage's entries are the truth and the board is not.
 *
 * A structure whose `seedLimit` sits BELOW the threshold count has taken none of the allowance:
 * the next seed it gains is an ordinary seed, not an additional one. Hence
 * `additionalSeedsAssigned` floors at 0 rather than going negative.
 */
export function getAdditionalSeedsAllowance(
  params: GetAdditionalSeedsAllowanceArgs,
): ResultType & Partial<AdditionalSeedsAllowanceResult> {
  const { tournamentRecord, drawDefinition, structureId, event } = params;

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const drawSize = positionAssignments?.length ?? 0;
  // Every non-BYE position: the entry count once BYEs are placed, and the full draw size before
  // anything is positioned — which is the right answer in both cases, since a generated structure
  // carries a positionAssignment per drawPosition from the start.
  const occupied = positionAssignments?.filter((assignment) => !assignment.bye).length ?? 0;
  const participantsCount = params.participantsCount ?? occupied;

  const policyResult = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_SEEDING],
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });
  const policy = policyResult.policyDefinitions?.[POLICY_TYPE_SEEDING];

  const seedLimit = structure.seedLimit ?? 0;

  const countResult = getSeedsCount({
    policyDefinitions: policyResult.policyDefinitions,
    requireParticipantCount: false,
    participantsCount,
    drawDefinition,
    drawSize,
    event,
  });

  const thresholdSeedsCount = countResult.seedsCount ?? 0;
  const additionalSeedsAllowed = countResult.additionalSeedsAllowed ?? 0;
  const additionalSeedsAssigned = Math.max(0, seedLimit - thresholdSeedsCount);
  const additionalSeedsRemaining = Math.max(0, additionalSeedsAllowed - additionalSeedsAssigned);

  return {
    bases: policy?.additionalSeeds?.bases,
    additionalSeedsRemaining,
    additionalSeedsAssigned,
    additionalSeedsAllowed,
    thresholdSeedsCount,
    seedLimit,
    drawSize,
  };
}
