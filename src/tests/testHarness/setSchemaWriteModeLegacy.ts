import { beforeEach } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import { LEGACY } from '@Constants/schemaWriteModeConstants';

/**
 * Vitest setupFiles hook (see vitest.config.mts).
 *
 * Pins every pre-existing test to LEGACY write mode so historical assertions
 * about `element.extensions[]` and `timeItems[]` keep passing without
 * modification. Tests that exercise the new write modes set the mode
 * explicitly inside the test or via their own `beforeEach`; running after
 * this hook means those overrides are respected.
 */
beforeEach(() => {
  setSchemaWriteMode(LEGACY);
});
