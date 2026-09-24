import { getAdditionalSeedsAllowance } from '@Query/drawDefinition/getAdditionalSeedsAllowance';
import { participantInEntries } from '@Query/drawDefinition/entryGetter';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, SeedingBasisUnion, Tournament } from '@Types/tournamentTypes';
import { SeedingProfile, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ADDITIONAL_SEEDS_EXHAUSTED,
  INVALID_PARTICIPANT_ID,
  SEEDSCOUNT_GREATER_THAN_DRAW_SIZE,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type AddAdditionalSeedArgs = {
  seedingBasis?: SeedingBasisUnion;
  seedingProfile?: SeedingProfile;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  participantsCount?: number;
  seedValue?: string | number;
  participantId: string;
  structureId: string;
  eventId?: string;
  event?: Event;
};

/**
 * Add ONE seed above a structure's current seed count, raising `seedLimit` to make room.
 *
 * This exists because protections arrive late. A returning player's entry is accepted after the
 * draw has been generated more often than before it, and `assignSeedPositions` gates on
 * `seedNumber <= seedLimit` — correctly, since its job is to fill an established set of seeds, not
 * to grow one. Without this entry point the only way to seed a late arrival is to regenerate the
 * draw, which throws away every positioning decision already made.
 *
 * The new seed takes `seedLimit + 1`, which is how it displaces nobody: every seed below it keeps
 * its number, its value and — because `constructPower2Blocks` fills seed blocks in order — its
 * drawPosition options. The participant is left UNPOSITIONED; placing them is
 * `positionSeedBlocks`' job and a separate decision.
 *
 * Refuses with `ADDITIONAL_SEEDS_EXHAUSTED` when the seeding policy's `additionalSeeds` allowance
 * is spent. A seed that would still sit at or below the policy's own threshold count is NOT
 * additional and does not consume that allowance — it is an ordinary seed the structure simply
 * had not yet created.
 *
 * Nothing is mutated on any error path: the participant's entry and the allowance are both
 * checked before `seedLimit` moves, and a failure inside `assignSeed` restores it.
 */
export function addAdditionalSeed(params: AddAdditionalSeedArgs): ResultType & { seedNumber?: number } {
  const { tournamentRecord, drawDefinition, seedingProfile, participantId, structureId, eventId, event } = params;
  const stack = 'addAdditionalSeed';

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  if (!participantId || !participantInEntries({ drawDefinition, participantId }))
    return decorateResult({ result: { error: INVALID_PARTICIPANT_ID }, context: { participantId }, stack });

  const allowance = getAdditionalSeedsAllowance({
    participantsCount: params.participantsCount,
    tournamentRecord,
    drawDefinition,
    structureId,
    event,
  });
  if (allowance.error) return allowance;

  const { additionalSeedsRemaining = 0, thresholdSeedsCount = 0, seedLimit = 0, drawSize = 0 } = allowance;
  const seedNumber = seedLimit + 1;

  if (seedNumber > drawSize)
    return decorateResult({
      result: { error: SEEDSCOUNT_GREATER_THAN_DRAW_SIZE },
      context: { seedNumber, drawSize },
      stack,
    });

  const isAdditional = seedNumber > thresholdSeedsCount;
  if (isAdditional && additionalSeedsRemaining < 1)
    return decorateResult({
      result: { error: ADDITIONAL_SEEDS_EXHAUSTED },
      context: { seedNumber, thresholdSeedsCount, ...allowance },
      stack,
    });

  structure.seedLimit = seedNumber;

  const result = assignSeed({
    seedValue: params.seedValue ?? seedNumber,
    seedingBasis: params.seedingBasis,
    tournamentRecord,
    drawDefinition,
    seedingProfile,
    participantId,
    structureId,
    seedNumber,
    eventId,
    event,
  });

  if (result?.error) {
    structure.seedLimit = seedLimit;
    structure.seedAssignments = (structure.seedAssignments ?? []).filter(
      (assignment) => assignment.seedNumber !== seedNumber,
    );
    return result;
  }

  return { ...SUCCESS, seedNumber };
}
