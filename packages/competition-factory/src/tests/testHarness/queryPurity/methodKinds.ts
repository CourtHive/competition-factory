import kinds from './methodKinds.json';

/**
 * Engine method kinds come from the same descriptors as the typed engine signatures.
 * Read the generated JSON here so setup leaves engine loading to the test file's mocks.
 */
export type MethodKind = 'query' | 'mutation' | 'generate' | 'engine';

const KINDS: Record<string, MethodKind | undefined> = kinds as Record<string, MethodKind>;

/** A method the check holds to "writes nothing": a query or a generator. */
export function mustNotWrite(methodName: string): boolean {
  const kind = KINDS[methodName];
  return kind === 'query' || kind === 'generate';
}
