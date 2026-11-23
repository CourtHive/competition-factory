import { inDraftWrites } from '@Global/state/withDraftWrites';

let count = 0;

/**
 * Per-isolated-file v1 writer probe; shared by the player and the hoisted mock. A write to a draft is not counted: a
 * recorded cascade runs v1's writers on v2's working copy (`outcome/plan/recordedCascade.ts`), and v1 was not asked.
 */
export const v1Writes = {
  get count() {
    return count;
  },
  set count(value: number) {
    if (!inDraftWrites()) count = value;
  },
};
