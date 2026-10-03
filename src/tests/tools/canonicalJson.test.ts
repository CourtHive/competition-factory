import { canonicalJson, canonicalizeJsonText, NonCanonicalValueError } from '@Tools/canonicalJson';
import { expect, it } from 'vitest';

/**
 * RFC 8785 test vectors, from the RFC's own appendix and the JCS reference test suite. A vector
 * is quoted, not paraphrased: the input is the JSON text the RFC gives and the expectation is the
 * byte string it gives. If one of these moves, it is the implementation that is wrong.
 */

it('RFC 8785 § 3.2.3: object keys sort by UTF-16 code unit, not by code point or locale', () => {
  // The RFC's own example. U+1F602 is the surrogate pair D83D DE02, which sorts BEFORE U+FB33
  // because D83D < FB33 as code units, even though 1F602 > FB33 as code points.
  const input =
    '{"\\u20ac": "Euro Sign", "\\r": "Carriage Return", "\\u000a": "Newline", "1": "One", ' +
    '"\\u0080": "Control\\u007f", "\\ud83d\\ude02": "Smiley", "\\u00f6": "Latin Small Letter O With Diaeresis", ' +
    '"\\ufb33": "Hebrew Letter Dalet With Dagesh", "</script>": "Browser Challenge"}';
  const expected =
    '{"\\n":"Newline","\\r":"Carriage Return","1":"One","</script>":"Browser Challenge",' +
    '"\u0080":"Control\u007f","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
    '"😂":"Smiley","דּ":"Hebrew Letter Dalet With Dagesh"}';
  expect(canonicalizeJsonText(input)).toEqual(expected);
});

it('RFC 8785 appendix: numbers, strings and literals', () => {
  const input =
    '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], ' +
    '"string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", "literals": [null, true, false]}';
  const expected =
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
    '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}';
  expect(canonicalizeJsonText(input)).toEqual(expected);
});

it('number formatting follows ECMAScript Number::toString, as the RFC specifies', () => {
  expect(canonicalJson([0, -0, 1, 1.0, 1e21, 1e-7, 0.1 + 0.2, 2 ** 53 + 1, 2 ** 53])).toEqual(
    '[0,0,1,1,1e+21,1e-7,0.30000000000000004,9007199254740992,9007199254740992]',
  );
});

it('is idempotent and whitespace-free', () => {
  const once = canonicalJson({ b: [1, { d: 2, c: 3 }], a: 'x' });
  expect(once).toEqual('{"a":"x","b":[1,{"c":3,"d":2}]}');
  expect(canonicalizeJsonText(once)).toEqual(once);
  expect(once).not.toMatch(/\s/);
});

it('drops undefined properties, nulls undefined array elements, honours toJSON', () => {
  const date = new Date('2026-10-01T12:00:00.000Z');
  expect(canonicalJson({ z: undefined, a: [undefined, 1], d: date, f: () => 1 })).toEqual(
    '{"a":[null,1],"d":"2026-10-01T12:00:00.000Z"}',
  );
});

it('refuses what JSON cannot carry instead of writing null for it', () => {
  expect(() => canonicalJson({ n: Number.NaN })).toThrow(NonCanonicalValueError);
  expect(() => canonicalJson({ n: Number.POSITIVE_INFINITY })).toThrow(/non-finite number at \/n/);
  expect(() => canonicalJson([1, [2, Number.NaN]])).toThrow(/at \/1\/1/);
  expect(() => canonicalJson({ big: BigInt(1) })).toThrow(NonCanonicalValueError);
  expect(() => canonicalJson(undefined)).toThrow(NonCanonicalValueError);
  expect(() => canonicalJson(() => 1)).toThrow(NonCanonicalValueError);
});

it('agrees with JSON.parse round-trip for a real-shaped record, so nothing is lost', () => {
  const record = {
    tournamentId: 't1',
    events: [{ eventId: 'e1', drawDefinitions: [{ drawId: 'd1', structures: [{ structureId: 's1', matchUps: [] }] }] }],
    extensions: [{ name: 'x', value: { nested: [3, 2, 1], flag: false } }],
    startDate: '2026-10-01',
  };
  const text = canonicalJson(record);
  expect(JSON.parse(text)).toEqual(record);
  expect(text.indexOf('"events"')).toBeLessThan(text.indexOf('"extensions"'));
  expect(text.indexOf('"extensions"')).toBeLessThan(text.indexOf('"startDate"'));
});
