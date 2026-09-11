import { beforeEach } from 'vitest';

import { setAuditAuthorityServer, setSaveDrawDeletions, setSchemaWriteMode } from '@Global/state/globalState';

// constants and types
import { LEGACY } from '@Constants/schemaWriteModeConstants';

/**
 * Vitest setupFiles hook (see vitest.config.mts).
 *
 * Pins every pre-existing test to LEGACY write mode so historical assertions
 * about `element.extensions[]` and `timeItems[]` keep passing without
 * modification. Also pins the Phase 6 drawDeletions flags so legacy
 * audit-trail assertions stay valid: production 5.0.0 default is
 * saveDrawDeletions=false, but tests assume telemetry is written. Tests that
 * exercise the new gates set the flags explicitly inside the test (or via
 * their own `beforeEach`); running after this hook means those overrides
 * are respected.
 */
beforeEach(() => {
  setSchemaWriteMode(LEGACY);
  setSaveDrawDeletions(true);
  setAuditAuthorityServer(false);
});
