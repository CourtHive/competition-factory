import { parseTallyFormat } from '@Query/matchUps/roundRobinTally/parseTallyFormat';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { expect, it } from 'vitest';

// Fixtures
import * as matchUpFormats from '@Fixtures/scoring/matchUpFormats';

// The tally parsed the same matchUpFormat for every matchUp it counted; it now parses each code once per
// process. The memo must return exactly what parse returns, and must not be writable.

const codes = [
  ...Object.values(matchUpFormats).flatMap((value) => (typeof value === 'string' ? [value] : [])),
  'SET1-S:P32',
  'SET1-S:T20',
  'SET3-S:6/TB7-F:TB10',
  'not a format',
  '',
];

it('returns what parse returns, for every fixture format and for malformed codes', () => {
  expect(codes.length).toBeGreaterThan(10);
  for (const code of codes) {
    expect(parseTallyFormat(code), code).toEqual(parse(code));
    // the second read is the cached one
    expect(parseTallyFormat(code), code).toEqual(parse(code));
  }
});

it('hands anything but a string to parse untouched', () => {
  expect(parseTallyFormat(undefined as any)).toEqual(parse(undefined as any));
  expect(parseTallyFormat(null as any)).toEqual(parse(null as any));
});

it('shares one frozen result per code, so a reader that writes throws instead of poisoning later tallies', () => {
  const code = 'SET3-S:6/TB7';
  const first: any = parseTallyFormat(code);
  expect(parseTallyFormat(code)).toBe(first);
  expect(Object.isFrozen(first)).toEqual(true);
  expect(Object.isFrozen(first.setFormat)).toEqual(true);
  expect(() => {
    first.setFormat.setTo = 4;
  }).toThrow();
  expect(parseTallyFormat(code)).toEqual(parse(code));
});

it('never returns the object parse handed to another caller', () => {
  const code = 'SET5-S:6/TB7';
  const cached: any = parseTallyFormat(code);
  const fresh: any = parse(code);
  fresh.bestOf = 99;
  expect(cached.bestOf).toEqual(5);
});
