import { HEADER_RE } from './importHeaderPattern.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The pattern this replaced, kept here only as the reference the new one must agree with.
const PREVIOUS =
  /^\/\/\/?\s*(import\s+(all\s+)?relevant\s+)?(constants?|contants|contstants|types?|fixtures)(\s*,?\s*(and\s+)?(constants?|contants|types?|fixtures))*\s*$/i;

test('CodeQL #223: a long header-like comment is decided in linear time', () => {
  const start = performance.now();
  assert.equal(HEADER_RE.test('//type' + ' type'.repeat(5_000) + '!'), false);
  assert.ok(performance.now() - start < 100, 'took ' + Math.round(performance.now() - start) + ' ms');
});

test('it agrees with the previous pattern on every separated header', () => {
  const words = ['constant', 'constants', 'contants', 'type', 'types', 'fixtures', 'Types', 'CONSTANTS'];
  const separators = [' ', ', ', ' , ', ',', ' and ', ', and ', '  '];
  const prefixes = ['// ', '//', '/// ', '// import relevant ', '// import all relevant '];
  let compared = 0;
  let matched = 0;
  for (const prefix of prefixes)
    for (const first of words)
      for (const separator of separators)
        for (const second of words)
          for (const tail of ['', ' ', '!', ' prose']) {
            for (const value of [prefix + first + tail, prefix + first + separator + second + tail]) {
              compared += 1;
              if (PREVIOUS.test(value)) matched += 1;
              assert.equal(HEADER_RE.test(value), PREVIOUS.test(value), JSON.stringify(value));
            }
          }
  assert.ok(compared > 5_000 && matched > 1_000, `compared ${compared}, matched ${matched}`);
});

test('the canonical headers still match', () => {
  for (const header of ['// constants', '// types', '// constants and types', '// Fixtures', '// constants, types'])
    assert.ok(HEADER_RE.test(header), header);
});
