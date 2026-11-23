import { expect, test } from 'vitest';

// constants
import * as errorConditionModule from '@Constants/errorConditionConstants';

/**
 * EVERY ERROR THE MODULE EXPORTS IS IN THE AGGREGATE IT PUBLISHES.
 *
 * `errorConditionConstants` is a hand-maintained object listing the module's errors, and it is what
 * consumers reach through `factoryConstants.errorConditionConstants`. Until 2026-10-04 it omitted 23 of
 * 224, among them VENUE_NOT_FOUND, MISSING_CONTEXT and PROPAGATED_EXITS_DOWNSTREAM: the named export
 * worked and `errorConditionConstants.VENUE_NOT_FOUND` was `undefined` (published 7.4.0: 202 keys).
 * `errorConstantUniqueness.test.ts` reads the aggregate, so those 23 codes were never checked either.
 */

const { errorConditionConstants } = errorConditionModule;
const isErrorObject = (value: unknown): value is { code: string; message: string } =>
  !!value && typeof value === 'object' && typeof (value as any).code === 'string';

test('every exported error condition is listed in errorConditionConstants, under its own name', () => {
  const exported = Object.entries(errorConditionModule).filter(([, value]) => isErrorObject(value));
  // CONTROL: the module was read, and a long-standing member is found by this filter
  expect(exported.length).toBeGreaterThan(200);
  expect(exported.map(([name]) => name)).toContain('INVALID_VALUES');

  const unlisted = exported.filter(([name, value]) => (errorConditionConstants as any)[name] !== value);
  expect(unlisted.map(([name]) => name)).toEqual([]);
});

test('errorConditionConstants lists nothing the module does not export', () => {
  const aggregateNames = Object.keys(errorConditionConstants);
  // CONTROL: the aggregate is populated
  expect(aggregateNames.length).toBeGreaterThan(200);
  const strays = aggregateNames.filter(
    (name) => (errorConditionModule as any)[name] !== (errorConditionConstants as any)[name],
  );
  expect(strays).toEqual([]);
});
