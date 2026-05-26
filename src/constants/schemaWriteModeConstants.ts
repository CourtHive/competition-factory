export const NATIVE = 'native';
export const LEGACY = 'legacy';
export const DUAL = 'dual';

export type SchemaWriteMode = typeof NATIVE | typeof DUAL | typeof LEGACY;

export const schemaWriteModes: SchemaWriteMode[] = [NATIVE, DUAL, LEGACY];

export const schemaWriteModeConstants = {
  NATIVE,
  LEGACY,
  DUAL,
};
