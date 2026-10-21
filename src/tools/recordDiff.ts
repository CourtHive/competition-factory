import { generatePatch } from '../forge/jsonPatch';
import { canonicalJson } from './canonicalJson';

// constants and types
import type { JsonPatchOp } from '../forge/jsonPatch';

/** Capture every JSON-stored value, independently of later writes to the record. */
export const captureRecord = (record: unknown): string => canonicalJson(record);

/**
 * Compare a record with its captured canonical JSON; report the first divergent JSON Pointer.
 *
 * No volatility is allowed: timestamps (including updatedAt), notes, schedule, extensions, event
 * entries and nested TEAM lines are all compared by value. In particular, a refused call has no
 * timestamp exemption. Cross-executor stamp comparison waits for Phase C's once-per-call contract.
 * JSON's own representation applies: absent and undefined object properties are equivalent, array
 * order is significant, and object insertion order is not. No factory version field is removed.
 * This is read-only measurement, never a production rollback mechanism.
 */
export function compareRecord(before: string, record: unknown): { equal: boolean; firstDifference?: JsonPatchOp } {
  const after = captureRecord(record);
  if (before === after) return { equal: true };
  const [firstDifference] = generatePatch(JSON.parse(before), JSON.parse(after));
  return { equal: false, firstDifference };
}
