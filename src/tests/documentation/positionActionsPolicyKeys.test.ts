import { POLICY_POSITION_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_POSITION_ACTIONS_DEFAULT';
import { expect, it } from 'vitest';
import fs from 'node:fs';

// constants
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';

/**
 * EVERY KEY OF THE DEFAULT POSITION-ACTIONS POLICY IS ONE THE ENGINE READS.
 *
 * The default carried `disbledStructures` from the 2023 TypeScript conversion until 2026-10-01. The
 * engine reads `disabledStructures` (`actionPolicyUtils`), and reads it with `?.find`, so a missing
 * key and an empty array mean the same thing — no structure disabled. The default's value WAS
 * empty, so the typo changed nothing anybody could see, and a consumer who copied the default and
 * filled the misspelled key in would have disabled nothing, silently.
 *
 * A misspelled policy key is never an error: it is an absent key with a default. So the keys are
 * held to the set the engine reads, and the published JSON copy in the docs to the fixture.
 */

const READ_BY_THE_ENGINE = new Set([
  'activePositionOverrides',
  'disabledStructures',
  'otherFlightEntries',
  'enabledStructures',
  'policyName',
]);

it('the default position-actions policy carries only keys the engine reads', () => {
  const keys = Object.keys(POLICY_POSITION_ACTIONS_DEFAULT[POLICY_TYPE_POSITION_ACTIONS]);
  // CONTROL: the policy was read
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.filter((key) => !READ_BY_THE_ENGINE.has(key))).toEqual([]);
  expect(keys).toContain('disabledStructures');
});

it('the documentation copy of the policy carries the same keys', () => {
  const published = JSON.parse(fs.readFileSync('documentation/docs/policies/positionActions.json', 'utf8'));
  const documented = Object.keys(published[POLICY_TYPE_POSITION_ACTIONS] ?? published);
  // CONTROL: the copy was found and parsed
  expect(documented.length).toBeGreaterThan(0);
  expect(documented.filter((key) => !READ_BY_THE_ENGINE.has(key))).toEqual([]);
});
