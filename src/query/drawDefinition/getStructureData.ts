import { getDrawData } from '@Query/drawDefinition/getDrawData';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import {
  ErrorType,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * One structure's data — the drill-in tier of the payload decomposition
 * (`Mentat/planning/PUBLISH_WARMCACHE_AND_PAYLOAD_DECOMPOSITION.md`). A client lists draws with
 * `drawsProfile: STUBS`, lists structures with `structuresProfile: STUBS`, then fetches exactly the one
 * structure it is about to render.
 *
 * ⚠️ **This narrows the PAYLOAD, not the computation.** Measured across SINGLE_ELIMINATION,
 * ROUND_ROBIN, COMPASS, CURTIS_CONSOLATION, FEED_IN_CHAMPIONSHIP and a qualifying-fed draw, every draw
 * resolves to a SINGLE structure group: `getStructureGroups` partitions by linkage, and a draw's
 * structures are linked by construction. There is no independent group to skip.
 *
 * Assembling one structure in isolation is therefore not available cheaply — within-group values depend
 * on siblings (`sourceStructuresComplete` reads `completedStructures[sourceId]`, which would read
 * `undefined` for a skipped source and report a complete source as incomplete).
 *
 * The value is real but specific: a **smaller response** and, more importantly, a **per-structure cache
 * entry**. Cache granularity is invalidation granularity — a score in one structure need not evict
 * another's cached payload. That was G2's second prize and it does not depend on saving compute.
 *
 * Do not describe this as reducing server work; it does not, and an earlier draft of it wrongly claimed
 * it did.
 */
export function getStructureData(params: any): {
  structure?: any;
  drawInfo?: any;
  success?: boolean;
  error?: ErrorType;
} {
  const { drawDefinition, structureId } = params ?? {};
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };

  // Fail before any assembly when the id is not in this draw.
  const { structure: found } = findStructure({ drawDefinition, structureId });
  if (!found) return { error: STRUCTURE_NOT_FOUND };

  const result: any = getDrawData(params);
  if (result.error) return result;

  const structure = (result.structures ?? []).find((s: any) => s?.structureId === structureId);
  // A structure can be filtered out by publish state though it exists in the draw — a legitimate empty
  // result for a public reader, not an error.
  return { ...SUCCESS, structure, drawInfo: result.drawInfo };
}
