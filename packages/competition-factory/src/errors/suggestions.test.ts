/**
 * Unit tests for the error-code suggestions registry (developer-joy #7).
 */
import { describe, expect, it } from 'vitest';

import { getSuggestions, registerSuggestions } from './suggestions';

describe('getSuggestions — seeded registry entries', () => {
  // Each seeded entry returns a non-empty actionable list. Exercising all of
  // them ensures the factory functions run + their string templates produce
  // output (covers ~14 factory bodies).
  it.each([
    'ERR_MISSING_TOURNAMENT',
    'ERR_MISSING_TOURNAMENTS',
    'ERR_MISSING_DRAWDEF',
    'ERR_MISSING_EVENT_ID',
    'ERR_INVALID_DATE',
    'ERR_NOT_FOUND_PARTICIPANT',
    'ERR_NOT_FOUND_STRUCTURE',
    'ERR_NOT_FOUND_MATCHUP',
    'ERR_NOT_FOUND_EVENT',
    'ERR_MISSING_SANCTIONING_RECORD',
    'ERR_MISSING_OFFICIAL_RECORD',
    'ENGINE_RETURNED_UNDEFINED',
  ])('returns a non-empty suggestion list for %s', (code) => {
    const suggestions = getSuggestions(code);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(typeof s).toBe('string');
  });

  it('ERR_MISSING_VALUE references the key when provided in context', () => {
    const withKey = getSuggestions('ERR_MISSING_VALUE', { key: 'tournamentId' });
    expect(withKey[0]).toContain('tournamentId');

    const withoutKey = getSuggestions('ERR_MISSING_VALUE');
    expect(withoutKey[0]).not.toContain('undefined');
    expect(withoutKey[0]).toMatch(/required parameter/);
  });

  it('ERR_INVALID_VALUES lists context field names when supplied', () => {
    const withFields = getSuggestions('ERR_INVALID_VALUES', { drawSize: 'bad', eventName: 'X' });
    expect(withFields[0]).toContain('drawSize');
    expect(withFields[0]).toContain('eventName');

    const empty = getSuggestions('ERR_INVALID_VALUES');
    expect(empty[0]).toMatch(/expected types and ranges/);
  });

  it('ERR_MISSING_VALUE handles non-object context as missing key', () => {
    expect(getSuggestions('ERR_MISSING_VALUE', null as any)[0]).toMatch(/required parameter/);
  });
});

describe('getSuggestions — unknown codes + custom registrations', () => {
  it('returns [] for an unknown code', () => {
    expect(getSuggestions('NO_SUCH_CODE')).toEqual([]);
  });

  it('registerSuggestions adds a code and getSuggestions resolves it', () => {
    registerSuggestions('CUSTOM_CODE', () => ['custom advice']);
    expect(getSuggestions('CUSTOM_CODE')).toEqual(['custom advice']);
  });

  it('registerSuggestions overrides an existing entry', () => {
    registerSuggestions('ERR_MISSING_TOURNAMENT', () => ['overridden']);
    expect(getSuggestions('ERR_MISSING_TOURNAMENT')).toEqual(['overridden']);
  });

  it('factory throwing inside getSuggestions returns [] (never propagates)', () => {
    registerSuggestions('THROWS', () => {
      throw new Error('boom');
    });
    expect(getSuggestions('THROWS')).toEqual([]);
  });

  it('factory returning undefined is normalized to []', () => {
    registerSuggestions('NULLISH', () => undefined as any);
    expect(getSuggestions('NULLISH')).toEqual([]);
  });
});
