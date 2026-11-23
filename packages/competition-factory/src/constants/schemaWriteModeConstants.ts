export const NATIVE = 'native';
/** @deprecated writes are native only in 8.0.0; records written in this mode are still read */
export const LEGACY = 'legacy';
/** @deprecated writes are native only in 8.0.0; records written in this mode are still read */
export const BRIDGE = 'bridge';

export type SchemaWriteMode = typeof NATIVE | typeof BRIDGE | typeof LEGACY;

export const schemaWriteModes: SchemaWriteMode[] = [NATIVE, BRIDGE, LEGACY];

export const schemaWriteModeConstants = {
  NATIVE,
  LEGACY,
  BRIDGE,
} as const;
