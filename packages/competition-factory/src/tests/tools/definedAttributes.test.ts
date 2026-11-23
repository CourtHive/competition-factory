import { definedAttributes } from '@Tools/definedAttributes';
import { expect, test } from 'vitest';

test('null empty or undefined attributes can be stripped out of JSON', () => {
  const example = {
    undefined: undefined,
    null: null,
    arrayWithUndefined: [1, undefined, 2, 3, undefined],
    arrayWithObjects: [{ undefined: undefined, 1: 'one', null: null }],
    defined: 'defined',
  };
  const cleaned = definedAttributes(example);
  expect(cleaned).toEqual({
    arrayWithUndefined: [1, undefined, 2, 3, undefined],
    arrayWithObjects: [{ 1: 'one' }],
    defined: 'defined',
  });
});

test('an array inside an array stays an array, at every depth', () => {
  const example = {
    pairs: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    rounds: [
      [
        [
          ['x', 'y'],
          ['z', 'w'],
        ],
      ],
    ],
    mixed: [1, [2, undefined], { inner: [[3]], dropped: undefined }],
  };
  expect(definedAttributes(example)).toEqual({
    pairs: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    rounds: [
      [
        [
          ['x', 'y'],
          ['z', 'w'],
        ],
      ],
    ],
    // undefined array elements are kept, as before; objects inside arrays are still cleaned
    mixed: [1, [2, undefined], { inner: [[3]] }],
  });
  expect(Array.isArray(definedAttributes(example).pairs[0])).toEqual(true);
});
