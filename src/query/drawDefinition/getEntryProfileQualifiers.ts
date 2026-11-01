// types
import type { EntryQualifyingProfile, EventEntryProfile } from '@Types/tournamentTypes';

/**
 * The MAIN places an event's `entryProfile` holds for qualifiers before any structure exists.
 *
 * `qualifiersCount` states it in the simple case. With `qualifyingProfiles`, each profile's final
 * stage — its structure profiles with the highest `stageSequence` — feeds MAIN, so their
 * `qualifyingPositions` are summed; earlier stages (pre-qualifying) feed the next qualifying stage
 * and fill no MAIN place. A profile feeding a later MAIN round (`roundTarget`) still fills MAIN
 * positions, as the generated structure's links count them.
 *
 * `qualifyingDrawSize` alone holds nothing: a qualifying draw's size does not say how many it sends on.
 */
export function getEntryProfileQualifiersCount(entryProfile?: EventEntryProfile): number {
  if (!entryProfile) return 0;
  if (entryProfile.qualifyingProfiles?.length) {
    return entryProfile.qualifyingProfiles.reduce((total, profile) => total + finalStageQualifiers(profile), 0);
  }
  return Number.isSafeInteger(entryProfile.qualifiersCount) ? (entryProfile.qualifiersCount as number) : 0;
}

function finalStageQualifiers(profile: EntryQualifyingProfile): number {
  const structureProfiles = profile?.structureProfiles ?? [];
  const finalStage = Math.max(0, ...structureProfiles.map((sp) => sp.stageSequence ?? 1));
  return structureProfiles
    .filter((sp) => (sp.stageSequence ?? 1) === finalStage)
    .reduce((total, sp) => total + (Number.isSafeInteger(sp.qualifyingPositions) ? sp.qualifyingPositions! : 0), 0);
}
