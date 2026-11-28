import { resolveTieFormat, tieFormatConstants, tieFormats } from '../src';
import { describe, expect, it } from 'vitest';

describe('resolveTieFormat', () => {
  it.each(Object.keys(tieFormatConstants))('%s resolves to a copy without collectionIds', (name) => {
    const resolved: any = resolveTieFormat(name);
    expect(resolved.collectionDefinitions.length).toEqual((tieFormats as any)[name].collectionDefinitions.length);
    expect(resolved.collectionDefinitions.every((collection: any) => collection.collectionId === undefined)).toEqual(
      true,
    );
    expect(resolved).not.toBe((tieFormats as any)[name]);
  });

  it('returns undefined for a name it does not hold', () => {
    expect(resolveTieFormat('NOT_A_TIE_FORMAT')).toBeUndefined();
    expect(resolveTieFormat('toString')).toBeUndefined();
  });
});
