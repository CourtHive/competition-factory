import { coerceEven } from '@Tools/math';

// types
import type { MockQualifyingProfile, MockStructureProfile } from '@Types/mocksTypes';

export type QualifyingEntryPlanItem = {
  entryStageSequence: number;
  participantsCount: number;
  roundTarget: number;
};

/**
 * The QUALIFYING direct entries a mock drawProfile's `qualifyingProfiles` call for, structure by structure.
 *
 * Profiles are taken in `roundTarget` order (an absent roundTarget follows the previous one, the first being 1)
 * and their structures in `stageSequence` order. A structure's direct entries are its drawSize (or its
 * participantsCount, made even) less the qualifyingPositions the previous stage sends into it.
 * Neither the profiles nor their structureProfiles are reordered in place.
 */
export function getQualifyingEntryPlan(qualifyingProfiles?: MockQualifyingProfile[]): QualifyingEntryPlanItem[] {
  const plan: QualifyingEntryPlanItem[] = [];
  if (!Array.isArray(qualifyingProfiles)) return plan;

  const sequenceSort = (a: MockStructureProfile, b: MockStructureProfile) =>
    (a.stageSequence as number) - (b.stageSequence as number);
  const roundTargetSort = (a: MockQualifyingProfile, b: MockQualifyingProfile) =>
    (a.roundTarget as number) - (b.roundTarget as number);

  let roundTarget = 1;
  for (const roundTargetProfile of [...qualifyingProfiles].sort(roundTargetSort)) {
    roundTarget = roundTargetProfile.roundTarget || roundTarget;
    let entryStageSequence = 1;
    let qualifyingPositions: number | undefined;

    for (const structureProfile of [...(roundTargetProfile.structureProfiles ?? [])].sort(sequenceSort)) {
      const drawSize = structureProfile.drawSize || coerceEven(structureProfile.participantsCount);
      plan.push({ participantsCount: drawSize - (qualifyingPositions || 0), entryStageSequence, roundTarget });

      qualifyingPositions = structureProfile.qualifyingPositions;
      entryStageSequence += 1;
    }

    roundTarget += 1;
  }

  return plan;
}

export function getQualifyingEntriesCount(qualifyingProfiles?: MockQualifyingProfile[]): number {
  return getQualifyingEntryPlan(qualifyingProfiles).reduce(
    (total, { participantsCount }) => total + participantsCount,
    0,
  );
}
