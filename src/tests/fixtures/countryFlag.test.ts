import { countries, countryToFlag, flagIOC } from '@Fixtures/countryData';
import { expect, it, describe } from 'vitest';

/**
 * A flag emoji is exactly two Unicode regional indicator symbols. Counting code points is the
 * whole assertion: `countryToFlag` maps letter -> indicator, so a three-letter code silently
 * produced three of them and rendered as the flag plus a stray letter ("🇺🇸🇦"). Nothing threw,
 * nothing was undefined — it just looked wrong, which is why it survived in four consumers.
 */
const REGIONAL_INDICATOR = /^[\u{1F1E6}-\u{1F1FF}]+$/u;

function indicatorCount(flag: string): number {
  return [...flag].length;
}

describe('countryToFlag', () => {
  it('maps a two-letter alpha-2 code to a two-indicator flag', () => {
    expect(indicatorCount(countryToFlag('US'))).toBe(2);
    expect(REGIONAL_INDICATOR.test(countryToFlag('US'))).toBe(true);
  });

  it('maps a three-letter alpha-3 code to the SAME flag, not three indicators', () => {
    expect(countryToFlag('USA')).toEqual(countryToFlag('US'));
    expect(indicatorCount(countryToFlag('USA'))).toBe(2);
  });

  it('accepts an IOC code that differs from the alpha-3 code', () => {
    // GER (IOC) vs DEU (ISO alpha-3) — both must resolve to the German flag.
    expect(countryToFlag('GER')).toEqual(countryToFlag('DE'));
  });

  it('is case-insensitive', () => {
    expect(countryToFlag('usa')).toEqual(countryToFlag('USA'));
    expect(countryToFlag('us')).toEqual(countryToFlag('US'));
  });

  it('never emits three or more indicators for any country in the fixture', () => {
    // The regression in aggregate: every alpha-3 code in the table must round-trip to a
    // two-indicator flag. A single stray letter anywhere fails this.
    const offenders = countries
      .filter((country) => country.iso && country.iso2)
      .map((country) => ({ iso: country.iso, flag: countryToFlag(country.iso) }))
      .filter((entry) => indicatorCount(entry.flag) !== 2);

    expect(offenders).toEqual([]);
  });

  it('returns an unrecognised code unchanged rather than a garbage glyph', () => {
    expect(countryToFlag('ZZZ')).toEqual('ZZZ');
  });

  it('returns falsy input unchanged', () => {
    expect(countryToFlag('')).toEqual('');
  });
});

describe('flagIOC', () => {
  it('resolves an IOC code to a two-indicator flag', () => {
    // flagIOC maps ioc -> `c.iso`, which is alpha-3 — so it produced three indicators for
    // every country until countryToFlag learned to normalise.
    expect(indicatorCount(flagIOC('USA'))).toBe(2);
    expect(flagIOC('USA')).toEqual(countryToFlag('US'));
  });

  it('resolves every IOC code in the fixture to a two-indicator flag', () => {
    const offenders = countries
      .filter((country) => country.ioc && country.iso2)
      .map((country) => ({ ioc: country.ioc, flag: flagIOC(country.ioc) }))
      .filter((entry) => indicatorCount(entry.flag) !== 2);

    expect(offenders).toEqual([]);
  });
});
