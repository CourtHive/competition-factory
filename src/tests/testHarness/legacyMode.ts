import { afterEach, beforeEach, describe } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';

/**
 * Pin a block of *storage-shape* specs to LEGACY write mode, regardless of the suite default.
 *
 * Inverse of {@link writeModeMatrix}. The suite default is being flipped to NATIVE (production);
 * a spec that asserts the LEGACY storage location directly (`element.extensions[i]`,
 * `matchUp.timeItems.length`, an `addExtension` mutation-method emission) only holds in LEGACY.
 * Wrap it (or its describe) with `legacyMode` so it keeps asserting the legacy representation under
 * the flipped default, and add a NATIVE sibling asserting the first-class shape — never delete the
 * legacy assertion.
 *
 * The `beforeEach` here registers after the global setupFiles hook, so it runs later and wins;
 * `afterEach` restores NATIVE (the new default) so the mode never leaks into sibling specs sharing
 * the worker.
 *
 *   legacyMode('addExtension emits a timeItem', () => {
 *     it('writes 12 timeItems', () => { ... expect(matchUp.timeItems.length).toEqual(12); });
 *   });
 *
 * See planning/NATIVE_WRITEMODE_FLIP_BURNDOWN.md.
 */
export function legacyMode(title: string, build: () => void): void {
  describe(`[writeMode: ${LEGACY}] ${title}`, () => {
    beforeEach(() => setSchemaWriteMode(LEGACY));
    afterEach(() => setSchemaWriteMode(NATIVE));
    build();
  });
}
