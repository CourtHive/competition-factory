import { beforeEach } from 'vitest';

import { setAuditAuthorityServer, setSaveDrawDeletions, setSchemaWriteMode } from '@Global/state/globalState';

// constants and types
import { NATIVE } from '@Constants/schemaWriteModeConstants';

/**
 * Vitest setupFiles hook pinning the NATIVE writeMode. This is the DEFAULT suite setup as of the
 * 2026-07-03 writeMode flip (vitest.config.mts) — production runs NATIVE (first-class
 * `matchUp.schedule.*` / first-class scalars, no timeItem mirror), so the suite validates the
 * representation production actually writes.
 *
 * Legacy-shape storage specs opt back into LEGACY via the `legacyMode()` helper (which uses
 * setSchemaWriteModeLegacy semantics); behavioral specs cover all modes via `writeModeMatrix`.
 * Keeps the same drawDeletions / audit flags as the LEGACY hook so only the write mode differs.
 * See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */
beforeEach(() => {
  setSchemaWriteMode(NATIVE);
  setSaveDrawDeletions(true);
  setAuditAuthorityServer(false);
});
