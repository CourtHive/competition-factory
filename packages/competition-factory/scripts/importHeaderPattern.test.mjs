import { HEADER_RE } from './importHeaderPattern.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('CodeQL #223: a long header-like comment is decided in linear time', () => {
  const start = performance.now();
  assert.equal(HEADER_RE.test('//type' + ' type'.repeat(5_000) + '!'), false);
  assert.ok(performance.now() - start < 100, 'took ' + Math.round(performance.now() - start) + ' ms');
});

test('accepts separated header words and leaves prose alone', () => {
  const words = ['constant', 'constants', 'contants', 'type', 'types', 'fixtures', 'Types', 'CONSTANTS'];
  const separators = [' ', ', ', ' , ', ',', ' and ', ', and ', '  '];
  const prefixes = ['// ', '//', '/// ', '// import relevant ', '// import all relevant '];
  for (const prefix of prefixes) {
    for (const first of [...words, 'contstants']) {
      for (const separator of separators) {
        for (const second of words) {
          const header = prefix + first + separator + second;
          assert.ok(HEADER_RE.test(header), header);
          assert.ok(HEADER_RE.test(header + ' '), header);
          assert.equal(HEADER_RE.test(header + '!'), false, header);
          assert.equal(HEADER_RE.test(header + ' prose'), false, header);
        }
      }
      assert.equal(HEADER_RE.test(prefix + first + first), false);
    }
  }
});

test('the canonical headers still match', () => {
  for (const header of ['// constants', '// types', '// constants and types', '// Fixtures', '// constants, types'])
    assert.ok(HEADER_RE.test(header), header);
});
