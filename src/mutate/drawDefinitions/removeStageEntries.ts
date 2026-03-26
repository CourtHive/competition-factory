import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Remove all draw entries for a given entryStage.
 * Unlike removeDrawEntries (which filters by participantId across all stages),
 * this removes entries specifically by their entryStage field.
 */
export function removeStageEntries({ drawDefinition, entryStage }: { drawDefinition: any; entryStage: string }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!entryStage) return { error: INVALID_VALUES };

  if (drawDefinition.entries) {
    drawDefinition.entries = drawDefinition.entries.filter((e: any) => e.entryStage !== entryStage);
  }

  return { ...SUCCESS };
}
