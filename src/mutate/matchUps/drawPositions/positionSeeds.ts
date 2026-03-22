import { getValidSeedBlocks, getNextSeedBlock } from '@Query/drawDefinition/seedGetter';
import { getAttributeGroupings } from '@Query/participants/getAttributeGrouping';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { assignDrawPosition } from './positionAssignment';
import { findStructure } from '@Acquire/findStructure';
import { generateRange } from '@Tools/arrays';

// constants and types
import { PolicyDefinitions, SeedBlock, SeedingProfile, MatchUpsMap } from '@Types/factoryTypes';
import { ErrorType, MISSING_DRAW_POSITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';

type PositionSeedBlocksArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  participants?: HydratedParticipant[];
  appliedPolicies?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  validSeedBlocks?: SeedBlock[];
  seedingProfile?: SeedingProfile;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  groupsCount?: number;
  structureId?: string;
  seedBlockInfo?: any;
  event?: Event;
};
export function positionSeedBlocks({
  provisionalPositioning,
  inContextDrawMatchUps,
  tournamentRecord,
  appliedPolicies,
  validSeedBlocks,
  drawDefinition,
  seedingProfile,
  seedBlockInfo,
  participants,
  groupsCount,
  structureId,
  matchUpsMap,
  structure,
  event,
}: PositionSeedBlocksArgs) {
  const seedPositions: number[] = [];
  const errors: any[] = [];
  let placedSeedBlocks = 0;

  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));
  if (!structureId) structureId = structure?.structureId;

  if (!appliedPolicies) {
    appliedPolicies = getAppliedPolicies({ drawDefinition }).appliedPolicies;
  }
  if (!validSeedBlocks) {
    const result =
      structure &&
      getValidSeedBlocks({
        provisionalPositioning,
        appliedPolicies,
        drawDefinition,
        seedingProfile,
        structure,
      });
    if (result?.error) errors.push(result.error);
    validSeedBlocks = result?.validSeedBlocks;
  }

  groupsCount = groupsCount ?? validSeedBlocks?.length ?? 0;

  generateRange(0, groupsCount).forEach(() => {
    if (placedSeedBlocks < (groupsCount || 0)) {
      const result = positionSeedBlock({
        provisionalPositioning,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        seedingProfile,
        seedBlockInfo,
        participants,
        structureId,
        matchUpsMap,
        event,
      });
      if (result?.success) {
        placedSeedBlocks++;
        seedPositions.push(...(result.seedPositions ?? []));
      }
      if (result.error) {
        errors.push({ seedPositionError: result.error });
      }
    }
  });

  if (errors.length) return { error: errors };
  return { ...SUCCESS, seedPositions };
}

function positionSeedBlock({
  provisionalPositioning,
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  seedingProfile,
  seedBlockInfo,
  participants,
  structureId,
  matchUpsMap,
  event,
}): { success?: boolean; error?: ErrorType; seedPositions?: number[] } {
  const { unplacedSeedParticipantIds, unfilledPositions } = getNextSeedBlock({
    provisionalPositioning,
    randomize: true,
    drawDefinition,
    seedingProfile,
    seedBlockInfo,
    structureId,
    event,
  });

  const { appliedPolicies } = getAppliedPolicies({ drawDefinition });
  const avoidance = appliedPolicies?.[POLICY_TYPE_AVOIDANCE];
  if (avoidance?.policyAttributes && participants && unplacedSeedParticipantIds?.length > 2) {
    reorderSeedsForAvoidance({
      unplacedSeedParticipantIds,
      unfilledPositions,
      policyAttributes: avoidance.policyAttributes,
      participants,
    });
  }

  const seedPositions: number[] = [];

  for (const participantId of unplacedSeedParticipantIds) {
    const drawPosition = unfilledPositions.pop();
    if (!drawPosition) return { error: MISSING_DRAW_POSITION };
    seedPositions.push(drawPosition);

    const result = assignDrawPosition({
      provisionalPositioning,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      seedingProfile,
      participantId,
      seedBlockInfo,
      drawPosition,
      matchUpsMap,
      structureId,
      event,
    });

    if (!result.success) return result;
  }

  return { ...SUCCESS, seedPositions };
}

/**
 * Reorder unplacedSeedParticipantIds in-place so that seeds sharing
 * avoidance attributes (e.g. same nationality) are assigned to different
 * sections of the draw (halves, quarters, etc.).
 *
 * Since seeds are placed by popping unfilledPositions (LIFO), the LAST
 * position in unfilledPositions is assigned to the FIRST participantId.
 * We map positions to draw sections, then reorder seeds so that same-group
 * members land in different sections.
 */
function reorderSeedsForAvoidance({
  unplacedSeedParticipantIds,
  unfilledPositions,
  policyAttributes,
  participants,
}: {
  unplacedSeedParticipantIds: string[];
  unfilledPositions: number[];
  policyAttributes: any[];
  participants: any[];
}) {
  // Build attribute groupings: { "USA": ["p1", "p5"], "GBR": ["p2"] }
  const groupingsResult = getAttributeGroupings({
    targetParticipantIds: unplacedSeedParticipantIds,
    policyAttributes,
    participants,
  });
  if ('error' in groupingsResult) return;

  const groupings = groupingsResult as { [key: string]: string[] };

  // Only proceed if there are groups with more than one seed
  const conflictGroups = Object.values(groupings).filter((ids) => ids.length > 1);
  if (!conflictGroups.length) return;

  // Determine draw sections based on position count
  const positionCount = unfilledPositions.length;
  if (positionCount < 2) return;

  // Map each slot index to a section: slot 0 gets position[last], slot 1 gets position[last-1], etc.
  // Section is determined by which part of the draw the position falls in
  const maxPosition = Math.max(...unfilledPositions);
  const sectionCount = Math.min(positionCount, Math.max(2, conflictGroups.length));
  const sectionSize = Math.ceil(maxPosition / sectionCount);

  const getSection = (position: number) => Math.floor((position - 1) / sectionSize);

  // Build slot-to-section map (slot i → section of unfilledPositions[positionCount - 1 - i])
  const slotSections = unplacedSeedParticipantIds.map((_, i) => {
    const position = unfilledPositions[positionCount - 1 - i];
    return position !== undefined ? getSection(position) : i;
  });

  // For each conflict group, try to assign members to different sections
  // by swapping their positions in the seed order
  for (const groupIds of conflictGroups) {
    if (groupIds.length < 2) continue;

    const indices = groupIds
      .map((id) => unplacedSeedParticipantIds.indexOf(id))
      .filter((i) => i >= 0);

    if (indices.length < 2) continue;

    // Check if any members are already in the same section
    const sectionsUsed = indices.map((i) => slotSections[i]);
    const hasDuplicate = sectionsUsed.length !== new Set(sectionsUsed).size;

    if (!hasDuplicate) continue;

    // Find non-group seed indices that could be swapped
    const groupIdSet = new Set(groupIds);
    const nonGroupIndices = unplacedSeedParticipantIds
      .map((id, i) => (!groupIdSet.has(id) ? i : -1))
      .filter((i) => i >= 0);

    // Greedy: for each duplicate-section member (after the first), try to find a swap partner in a different section
    const occupiedSections = new Set<number>();
    for (const idx of indices) {
      const section = slotSections[idx];
      if (!occupiedSections.has(section)) {
        occupiedSections.add(section);
        continue;
      }

      // Find a non-group index in a section not yet occupied by this group
      const swapIdx = nonGroupIndices.find((ni) => !occupiedSections.has(slotSections[ni]));

      if (swapIdx !== undefined) {
        // Swap the two seeds in the placement order
        const temp = unplacedSeedParticipantIds[idx];
        unplacedSeedParticipantIds[idx] = unplacedSeedParticipantIds[swapIdx];
        unplacedSeedParticipantIds[swapIdx] = temp;

        // Update section tracking
        const tempSection = slotSections[idx];
        slotSections[idx] = slotSections[swapIdx];
        slotSections[swapIdx] = tempSection;

        occupiedSections.add(slotSections[idx]);

        // Remove used swap target
        const ngIdx = nonGroupIndices.indexOf(swapIdx);
        if (ngIdx >= 0) nonGroupIndices.splice(ngIdx, 1);
      }
    }
  }
}
