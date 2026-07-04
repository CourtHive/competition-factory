import { afterEach, beforeEach, describe } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import { DUAL, LEGACY, NATIVE, SchemaWriteMode } from '@Constants/schemaWriteModeConstants';

/**
 * Run a block of *behavioral* specs under multiple schemaWriteModes.
 *
 * The default suite pins NATIVE via setupFiles (production parity, since the 2026-07-03 flip).
 * Behavioral specs (does the scheduler place/limit/deconflict correctly, does a query resolve the
 * value) are representation-agnostic and should hold in every mode — assert via engine queries, NOT
 * raw `timeItems[]` / `schedule.*`. Storage-shape specs (which representation the data lands in) stay
 * mode-specific: run the NATIVE assertion by default and `legacyMode()`-scope the LEGACY counterpart.
 *
 * Each mode gets its own `describe` whose `beforeEach` sets the mode. Because that hook is
 * registered after the global setupFiles hook, it runs later and wins; `afterEach` restores LEGACY
 * so the mode never leaks into sibling specs sharing the worker.
 *
 *   writeModeMatrix((mode) => {
 *     it(`schedules within court availability (${mode})`, () => { ... });
 *   });
 *
 * See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */
export function writeModeMatrix(
  build: (mode: SchemaWriteMode) => void,
  modes: SchemaWriteMode[] = [NATIVE, DUAL, LEGACY],
): void {
  for (const mode of modes) {
    describe(`[writeMode: ${mode}]`, () => {
      beforeEach(() => setSchemaWriteMode(mode));
      afterEach(() => setSchemaWriteMode(LEGACY));
      build(mode);
    });
  }
}
