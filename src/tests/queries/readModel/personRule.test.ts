import { isFactoryUuid, resolvePersonLink } from '@Query/readModel/personRule';
import { expect, it, describe } from 'vitest';

describe('isFactoryUuid', () => {
  it('recognizes bare RFC-4122 v4 ids', () => {
    expect(isFactoryUuid('1b671a64-40d5-491e-99b0-da01ff1f3341')).toBe(true);
  });

  it('recognizes prefixed UUID(pre) ids', () => {
    expect(isFactoryUuid('P_1b671a6440d5491e99b0da01ff1f3341')).toBe(true);
  });

  it('rejects provider/federation ids and junk', () => {
    expect(isFactoryUuid('UTR12345')).toBe(false);
    expect(isFactoryUuid('CZE416003')).toBe(false);
    expect(isFactoryUuid('')).toBe(false);
    expect(isFactoryUuid(undefined)).toBe(false);
    expect(isFactoryUuid(null)).toBe(false);
  });
});

describe('resolvePersonLink', () => {
  it('populates a real provider personId', () => {
    const link = resolvePersonLink('c8b0...-uuid-participant', 'UTR12345');
    expect(link.personId).toEqual('UTR12345');
    expect(link.linkSource).toEqual('providerId');
  });

  it('skips when personId === participantId (synthetic/local)', () => {
    const link = resolvePersonLink('same-id', 'same-id');
    expect(link.personId).toBeNull();
    expect(link.linkSource).toEqual('unresolved');
  });

  it('skips when personId is itself a factory UUID', () => {
    const link = resolvePersonLink('participant-x', '1b671a64-40d5-491e-99b0-da01ff1f3341');
    expect(link.personId).toBeNull();
    expect(link.linkSource).toEqual('unresolved');
  });

  it('skips when personId is absent', () => {
    const link = resolvePersonLink('participant-x', undefined);
    expect(link.personId).toBeNull();
    expect(link.linkSource).toEqual('unresolved');
  });
});
