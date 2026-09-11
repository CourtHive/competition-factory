export const NATIVE = 'native';
export const LEGACY = 'legacy';
export const BRIDGE = 'bridge';

export type SchemaWriteMode = typeof NATIVE | typeof BRIDGE | typeof LEGACY;

export const schemaWriteModes: SchemaWriteMode[] = [NATIVE, BRIDGE, LEGACY];

export const schemaWriteModeConstants = {
  NATIVE,
  LEGACY,
  BRIDGE,
} as const;
