import { beforeEach } from 'vitest';

import { setAuditAuthorityServer, setSaveDrawDeletions, setSchemaWriteMode } from '@Global/state/globalState';

// constants and types
import { NATIVE } from '@Constants/schemaWriteModeConstants';

/**
 * Vitest setupFiles hook for the NATIVE writeMode run (see vitest.native.config.mts).
 *
 * The default suite is pinned to LEGACY (setSchemaWriteModeLegacy) so historical
 * `timeItems[]` / `extensions[]` assertions keep passing. Production runs the default
 * NATIVE mode — first-class `matchUp.schedule.*` / first-class scalars, no timeItem mirror.
 * This hook pins NATIVE so `*.native.test.ts` specs validate the representation production
 * actually writes. Keeps the same drawDeletions / audit flags as the LEGACY hook so only the
 * write mode differs. See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */
beforeEach(() => {
  setSchemaWriteMode(NATIVE);
  setSaveDrawDeletions(true);
  setAuditAuthorityServer(false);
});
