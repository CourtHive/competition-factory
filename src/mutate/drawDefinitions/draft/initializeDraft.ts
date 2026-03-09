import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { DRAFT_STATE } from '@Constants/extensionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_DRAFT,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  NO_VALID_ATTRIBUTES,
} from '@Constants/errorConditionConstants';

type InitializeDraftArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  preferencesCount?: number;
  structureId?: string;
  tierCount?: number;
  force?: boolean;
};

export function initializeDraft({
  drawDefinition,
  preferencesCount = 3,
  structureId,
  tierCount = 3,
  force,
}: InitializeDraftArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (tierCount < 1 || preferencesCount < 1) return { error: INVALID_VALUES };

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

  // calculate tier sizes — distribute as evenly as possible
  const effectiveTierCount = Math.min(tierCount, unseededParticipantIds.length);
  const tiers = buildTiers(unseededParticipantIds, effectiveTierCount);

  const draftState = {
    status: 'SEEDS_PLACED' as const,
    structureId,
    preferencesCount,
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
