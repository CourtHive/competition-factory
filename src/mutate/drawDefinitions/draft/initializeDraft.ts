import { getParticipantScaleItem } from '@Query/participant/getParticipantScaleItem';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { DRAFT_STATE } from '@Constants/extensionConstants';
import { RANKING, RATING } from '@Constants/scaleConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ScaleAttributes } from '@Types/factoryTypes';
import {
  EXISTING_DRAFT,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  NO_VALID_ATTRIBUTES,
} from '@Constants/errorConditionConstants';

export type TierMethod = 'ENTRY_ORDER' | 'RANKING' | 'RATING';

type InitializeDraftArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  scaleAttributes?: ScaleAttributes;
  preferencesCount?: number;
  tierMethod?: TierMethod;
  ascending?: boolean; // true = lower values in tier 1; false = higher values in tier 1
  structureId?: string;
  tierCount?: number;
  event?: Event;
  force?: boolean;
};

export function initializeDraft({
  tournamentRecord,
  drawDefinition,
  scaleAttributes,
  preferencesCount = 3,
  tierMethod,
  ascending,
  structureId,
  tierCount,
  event,
  force,
}: InitializeDraftArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (tierCount !== undefined && tierCount < 1) return { error: INVALID_VALUES };
  if (preferencesCount < 1) return { error: INVALID_VALUES };

  // resolve structureId if not provided — default to MAIN stage single structure
  if (!structureId) {
    const mainStructures = drawDefinition.structures?.filter((s) => s.stage === MAIN);
    if (mainStructures?.length === 1) {
      structureId = mainStructures[0].structureId;
    }
  }
  if (!structureId) return { error: MISSING_STRUCTURE_ID };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: MISSING_STRUCTURE_ID };

  // check for existing draft
  const { extension: existing } = findExtension({ element: drawDefinition, name: DRAFT_STATE });
  if (existing?.value?.status && existing.value.status !== 'COMPLETE' && !force) {
    return { error: EXISTING_DRAFT };
  }

  // find unassigned positions — these are the positions available for preference nomination
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  const unassignedPositions = positionAssignments
    ?.filter((a: any) => !a.participantId && !a.bye && !a.qualifier)
    .map((a: any) => a.drawPosition);

  if (!unassignedPositions?.length) return { error: NO_VALID_ATTRIBUTES };

  // find seeded participantIds to exclude from draft
  const seedAssignments = structure.seedAssignments ?? [];
  const seededParticipantIds = new Set(seedAssignments.map((s: any) => s.participantId).filter(Boolean));

  // find all participants entered in the draw who are NOT seeded and NOT yet assigned
  const assignedParticipantIds =
    positionAssignments?.filter((a: any) => a.participantId).map((a: any) => a.participantId) ?? [];

  // entries for this structure
  const entries = drawDefinition.entries?.filter(
    (e: any) => !seededParticipantIds.has(e.participantId) && !assignedParticipantIds.includes(e.participantId),
  );

  const unseededParticipantIds = entries?.map((e: any) => e.participantId) ?? [];

  // sort participants by tier method before distributing into tiers
  const effectiveTierMethod: TierMethod = tierMethod ?? 'ENTRY_ORDER';
  const effectiveScaleAttributes = scaleAttributes ?? deriveScaleAttributes(effectiveTierMethod, event);

  // Resolve sort direction: explicit > default per tier method
  // Rankings: ascending (lower rank number = better = tier 1)
  // Ratings: caller should specify based on the rating system
  const effectiveAscending = ascending ?? (effectiveTierMethod === 'RANKING');

  const sortedParticipantIds = sortByTierMethod({
    participantIds: unseededParticipantIds,
    tierMethod: effectiveTierMethod,
    scaleAttributes: effectiveScaleAttributes,
    ascending: effectiveAscending,
    tournamentRecord,
  });

  // calculate tier sizes — distribute as evenly as possible
  const resolvedTierCount = tierCount ?? defaultTierCount(sortedParticipantIds.length, seededParticipantIds.size);
  const effectiveTierCount = Math.min(resolvedTierCount, sortedParticipantIds.length);
  const tiers = buildTiers(sortedParticipantIds, effectiveTierCount);

  const draftState = {
    status: 'SEEDS_PLACED' as const,
    structureId,
    preferencesCount,
    tierMethod: effectiveTierMethod,
    scaleAttributes: effectiveScaleAttributes,
    ascending: effectiveAscending,
    tiers,
    preferences: {} as Record<string, number[]>,
    unassignedDrawPositions: unassignedPositions,
  };

  addExtension({
    element: drawDefinition,
    extension: { name: DRAFT_STATE, value: draftState },
  });

  return {
    ...SUCCESS,
    draftState,
    unassignedDrawPositions: unassignedPositions,
    tiers,
  };
}

function deriveScaleAttributes(tierMethod: TierMethod, event?: Event): ScaleAttributes | undefined {
  if (tierMethod === 'RANKING') {
    return { scaleType: RANKING };
  }
  if (tierMethod === 'RATING') {
    const ratingType = (event as any)?.category?.ratingType;
    if (ratingType) return { scaleType: RATING, scaleName: ratingType };
    return undefined;
  }
  return undefined;
}

function sortByTierMethod({
  participantIds,
  tierMethod,
  scaleAttributes,
  ascending,
  tournamentRecord,
}: {
  participantIds: string[];
  tierMethod: TierMethod;
  scaleAttributes?: ScaleAttributes;
  ascending: boolean;
  tournamentRecord?: Tournament;
}): string[] {
  if (tierMethod === 'ENTRY_ORDER' || !scaleAttributes || !tournamentRecord) {
    return participantIds;
  }

  // Get scale values for each participant
  const withScale: { participantId: string; scaleValue: number }[] = [];
  const withoutScale: string[] = [];

  for (const participantId of participantIds) {
    const { scaleItem } = getParticipantScaleItem({
      tournamentRecord,
      scaleAttributes,
      participantId,
    });
    const raw = scaleItem?.scaleValue;
    const numeric = typeof raw === 'number' ? raw : Number.parseFloat(raw);
    if (!Number.isNaN(numeric) && raw != null) {
      withScale.push({ participantId, scaleValue: numeric });
    } else {
      withoutScale.push(participantId);
    }
  }

  // ascending = true: lower values in tier 1 (e.g. WTN, rankings)
  // ascending = false: higher values in tier 1 (e.g. DUPR, UTR, ELO)
  withScale.sort((a, b) => (ascending ? a.scaleValue - b.scaleValue : b.scaleValue - a.scaleValue));

  // Participants with scale values first (sorted), then those without
  return [...withScale.map((e) => e.participantId), ...withoutScale];
}

/**
 * Compute a sensible default tier count based on the number of unseeded
 * participants and the number of seeds.
 *
 * Rubric:
 * - With seeds and >= 24 unseeded: 3 tiers (remaining quarters of a 32-draw)
 * - No seeds or < 24 unseeded: 2 tiers (halves)
 * - Fewer than 4 participants: 1 tier
 */
export function defaultTierCount(unseededCount: number, seedCount: number): number {
  if (unseededCount < 4) return 1;
  if (seedCount > 0 && unseededCount >= 24) return 3;
  return 2;
}

function buildTiers(participantIds: string[], tierCount: number): { participantIds: string[]; resolved: boolean }[] {
  const tiers: { participantIds: string[]; resolved: boolean }[] = [];
  const baseSize = Math.floor(participantIds.length / tierCount);
  const remainder = participantIds.length % tierCount;

  let offset = 0;
  for (let i = 0; i < tierCount; i++) {
    // earlier tiers get extra participants if there's a remainder
    const size = baseSize + (i < remainder ? 1 : 0);
    tiers.push({
      participantIds: participantIds.slice(offset, offset + size),
      resolved: false,
    });
    offset += size;
  }

  return tiers;
}
