import { describe, expect, it } from 'vitest';

import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setSchemaWriteMode, getSchemaWriteMode } from '@Global/state/globalState';
import tournamentEngine from '../engines/syncEngine';

import { DUAL, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';

const TALLY_NAME = 'tally';
const TALLY_VALUE = { wins: 2, losses: 1 };

it('engine exposes schemaWriteMode setter + getter', () => {
  const original = getSchemaWriteMode();

  const native = tournamentEngine.schemaWriteMode(NATIVE);
  expect(native.success).toEqual(true);
  expect(tournamentEngine.getSchemaWriteMode()).toEqual(NATIVE);

  const dual = tournamentEngine.schemaWriteMode(DUAL);
  expect(dual.success).toEqual(true);
  expect(tournamentEngine.getSchemaWriteMode()).toEqual(DUAL);

  const legacy = tournamentEngine.schemaWriteMode(LEGACY);
  expect(legacy.success).toEqual(true);
  expect(tournamentEngine.getSchemaWriteMode()).toEqual(LEGACY);

  // reset to whatever the setupFile pinned (LEGACY) before exiting
  setSchemaWriteMode(original);
});

it('engine rejects invalid schemaWriteMode values', () => {
  const original = getSchemaWriteMode();
  const result = tournamentEngine.schemaWriteMode('bogus');
  expect(result.error).toBeDefined();
  expect(tournamentEngine.getSchemaWriteMode()).toEqual(original);
});

describe('NATIVE mode', () => {
  it('writes only the first-class attribute and removes any stale legacy extension', () => {
    setSchemaWriteMode(NATIVE);
    const element: any = {};

    setFirstClassOrExtension({
      element,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });

    expect(element.tally).toEqual(TALLY_VALUE);
    expect(element.extensions).toBeUndefined();

    // pre-existing legacy extension on the same name must be cleaned up
    const seeded: any = { extensions: [{ name: TALLY_NAME, value: { wins: 0, losses: 0 } }] };
    setFirstClassOrExtension({
      element: seeded,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });

    expect(seeded.tally).toEqual(TALLY_VALUE);
    expect(seeded.extensions.some((ext: any) => ext.name === TALLY_NAME)).toEqual(false);
  });

  it('deleting via undefined value removes both surfaces', () => {
    setSchemaWriteMode(NATIVE);
    const element: any = {
      tally: TALLY_VALUE,
      extensions: [{ name: TALLY_NAME, value: TALLY_VALUE }],
    };

    setFirstClassOrExtension({ element, attribute: 'tally', name: TALLY_NAME, value: undefined });

    expect(element.tally).toBeUndefined();
    expect(element.extensions.some((ext: any) => ext.name === TALLY_NAME)).toEqual(false);
  });
});

describe('DUAL mode', () => {
  it('writes both the first-class attribute and the legacy extension', () => {
    setSchemaWriteMode(DUAL);
    const element: any = {};

    setFirstClassOrExtension({
      element,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });

    expect(element.tally).toEqual(TALLY_VALUE);
    expect(element.extensions).toEqual([{ name: TALLY_NAME, value: TALLY_VALUE }]);
  });
});

describe('LEGACY mode', () => {
  it('writes only the legacy extension', () => {
    setSchemaWriteMode(LEGACY);
    const element: any = {};

    setFirstClassOrExtension({
      element,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });

    expect(element.tally).toBeUndefined();
    expect(element.extensions).toEqual([{ name: TALLY_NAME, value: TALLY_VALUE }]);
  });
});

describe('firstClassOrExtension read helper', () => {
  it('prefers the first-class attribute when both are present', () => {
    const element = {
      tally: { wins: 5 },
      extensions: [{ name: TALLY_NAME, value: { wins: 999 } }],
    };
    expect(firstClassOrExtension({ element, attribute: 'tally', name: TALLY_NAME })).toEqual({ wins: 5 });
  });

  it('falls back to the legacy extension when the first-class attribute is missing', () => {
    const element = {
      extensions: [{ name: TALLY_NAME, value: TALLY_VALUE }],
    };
    expect(firstClassOrExtension({ element, attribute: 'tally', name: TALLY_NAME })).toEqual(TALLY_VALUE);
  });

  it('returns undefined when neither surface holds a value', () => {
    expect(firstClassOrExtension({ element: {}, attribute: 'tally', name: TALLY_NAME })).toBeUndefined();
  });
});

describe('NATIVE → LEGACY round-trip read symmetry', () => {
  it('NATIVE write is readable through firstClassOrExtension', () => {
    setSchemaWriteMode(NATIVE);
    const element: any = {};
    setFirstClassOrExtension({
      element,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });
    expect(firstClassOrExtension({ element, attribute: 'tally', name: TALLY_NAME })).toEqual(TALLY_VALUE);
  });

  it('LEGACY write is readable through firstClassOrExtension', () => {
    setSchemaWriteMode(LEGACY);
    const element: any = {};
    setFirstClassOrExtension({
      element,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });
    expect(firstClassOrExtension({ element, attribute: 'tally', name: TALLY_NAME })).toEqual(TALLY_VALUE);
  });

  it('DUAL write is readable through firstClassOrExtension and prefers first-class', () => {
    setSchemaWriteMode(DUAL);
    const element: any = {};
    setFirstClassOrExtension({
      element,
      attribute: 'tally',
      name: TALLY_NAME,
      value: TALLY_VALUE,
      creationTime: false,
    });
    expect(firstClassOrExtension({ element, attribute: 'tally', name: TALLY_NAME })).toEqual(TALLY_VALUE);
    // the legacy extension is also present
    expect(element.extensions?.find((ext: any) => ext.name === TALLY_NAME)?.value).toEqual(TALLY_VALUE);
  });
});
