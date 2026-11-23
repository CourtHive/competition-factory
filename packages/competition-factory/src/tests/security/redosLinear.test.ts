import { parseScoreString } from '@Scoring/parse/parseScoreString';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

// CodeQL #170, #245, #246 (2026-11-23): three patterns were quadratic in input length, and nothing capped the length.
// Measured on dev through these public functions: 100k characters took ~4.3 s each; CFS accepts 8 MB bodies.
const BUDGET_MS = 250;
const elapsed = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

describe('score and format parsing stays linear on adversarial input', () => {
  const n = 50_000;

  it('#170 a matchUpFormat game section with a long digit run', () => {
    expect(elapsed(() => parse('SET3-S:6/TB7-G:a' + '99'.repeat(n)))).toBeLessThan(BUDGET_MS);
  });

  it('#245 a score string of unclosed parentheses', () => {
    expect(elapsed(() => parseScoreString({ scoreString: '('.repeat(2 * n) }))).toBeLessThan(BUDGET_MS);
  });

  it('#246 a score string of unclosed brackets', () => {
    expect(elapsed(() => parseScoreString({ scoreString: '['.repeat(2 * n) + '\\' }))).toBeLessThan(BUDGET_MS);
  });
});

describe('the linear scans return exactly what the replaced regexes returned', () => {
  // A seeded generator keeps failures reproducible.
  let seed = 20261123;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const sample = (alphabet: string, max: number) =>
    Array.from({ length: Math.floor(random() * max) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');

  it('firstEnclosed matches /\\(([^)]+)\\)/ and /\\[([^\\]]+)\\]/', async () => {
    const { firstEnclosed } = await import('@Scoring/parse/firstEnclosed');
    const cases: [RegExp, string, string][] = [
      [/\(([^)]+)\)/, '(', ')'],
      [/\[([^\]]+)\]/, '[', ']'],
    ];
    let matched = 0;
    for (let i = 0; i < 20_000; i++) {
      const value = sample('()[]6-7\\ ', 14);
      for (const [regex, open, close] of cases) {
        const expected = regex.exec(value);
        if (expected) matched += 1;
        expect(firstEnclosed(value, open, close), value).toEqual(expected ? [expected[0], expected[1]] : null);
      }
    }
    expect(matched).toBeGreaterThan(5_000); // the sample exercises matches, not only misses
  });

  it('splitDeuceSuffix matches /^(.+?)(\\d+D)$/', async () => {
    const { splitDeuceSuffix } = await import('@Helpers/matchUpFormatCode/parse');
    let matched = 0;
    for (let i = 0; i < 20_000; i++) {
      const value = sample('a99DT/', 9);
      const expected = /^(.+?)(\d+D)$/.exec(value);
      if (expected) matched += 1;
      expect(splitDeuceSuffix(value), value).toEqual(expected ? [expected[1], expected[2].slice(0, -1)] : undefined);
    }
    expect(matched).toBeGreaterThan(500); // ~800 of 20,000 samples match
  });
});
