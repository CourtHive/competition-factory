import { getStageDrawPositionsBreakdown } from '@Query/drawDefinition/getStageDrawPositions';
import { getStagePlaceTakingEntriesCount } from '@Query/drawDefinition/stageGetter';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import {
  INSUFFICIENT_DRAW_POSITIONS,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
} from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE, WITHDRAWN } from '@Constants/entryStatusConstants';
import type { DrawDefinition, Entry, Structure } from '@Types/tournamentTypes';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

type CheckQualifyingEntriesFitArgs = {
  existingQualifyingPlaceholderStructureId?: string;
  qualifyingStructures?: Structure[];
  drawDefinition: DrawDefinition;
  ignoreStageSpace?: boolean;
  drawEntries?: Entry[];
  stack: string;
};

/**
 * Explicit QUALIFYING drawEntries are the entries the caller chose: they are never trimmed to fit (CA 2026-11-01).
 * Entries that overfill the qualifying structures are refused before anything is written:
 * NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS, or INSUFFICIENT_DRAW_POSITIONS with `ignoreStageSpace` (which skips the
 * per-entry stage-space check, and leaves the draw positions to refuse what does not fit).
 *
 * Used when qualifying is added to an existing draw (the placeholder, if any, replaced by `qualifyingStructures`), and
 * when a new draw generates its qualifying structures with the main (`drawDefinition` already holds them).
 *
 * The places are counted as addDrawEntry's stage space counts them: the qualifying structures' draw positions less
 * any qualifier positions, against every place-taking QUALIFYING entry the draw would hold. A draw with no qualifying
 * structure has nothing to overfill, and generation from the event's entries (no drawEntries) is not checked here.
 */
export function checkQualifyingEntriesFit(params: CheckQualifyingEntriesFitArgs): ResultType {
  const { existingQualifyingPlaceholderStructureId, qualifyingStructures, ignoreStageSpace, drawDefinition, stack } =
    params;
  const qualifyingDrawEntries = (params.drawEntries ?? []).filter(
    ({ entryStage, entryStatus }) => entryStage === QUALIFYING && entryStatus !== WITHDRAWN,
  );
  if (!qualifyingDrawEntries.length) return {};

  // the draw as it would be: the placeholder replaced by the generated qualifying structures
  const structures = [
    ...(drawDefinition.structures ?? []).filter(
      ({ structureId }) => structureId !== existingQualifyingPlaceholderStructureId,
    ),
    ...(qualifyingStructures ?? []),
  ];
  const prospectiveDrawDefinition = { ...drawDefinition, structures };
  const { positionsAvailable, drawPositions } = getStageDrawPositionsBreakdown({
    drawDefinition: prospectiveDrawDefinition,
    stage: QUALIFYING,
  });
  if (!drawPositions) return {};

  // entries already on the draw keep their places; a drawEntry for the same participant is not added twice
  const existingEntries = drawDefinition.entries ?? [];
  const existingIds = new Set(existingEntries.map(({ participantId }) => participantId));
  const entries = [
    ...existingEntries,
    ...qualifyingDrawEntries.filter(({ participantId }) => !existingIds.has(participantId)),
  ].map((entry) => ({ ...entry, entryStatus: entry.entryStatus ?? DIRECT_ACCEPTANCE }));
  const entriesCount = getStagePlaceTakingEntriesCount({ stage: QUALIFYING, entries });

  if (entriesCount <= positionsAvailable) return {};
  return decorateResult({
    result: { error: ignoreStageSpace ? INSUFFICIENT_DRAW_POSITIONS : NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS },
    context: { stage: QUALIFYING, entriesCount, drawPositionsCount: positionsAvailable },
    stack,
  });
}
