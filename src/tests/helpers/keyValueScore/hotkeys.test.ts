import { keyValueConstants } from '@Helpers/keyValueScore/constants';
import { describe, expect, it } from 'vitest';

/**
 * `HOTKEYS` is the key list a consumer registers with a hotkey library (TMX's hotkey scoring). It named up, left,
 * shift+tab, enter, down, tab and right twice — MODIFIERS already carries MOVEUP and MOVEDOWN through CLOSERS — and
 * a library that registers each occurrence ran its handler twice per key, so one Tab moved two fields.
 */
describe('keyValueConstants.HOTKEYS', () => {
  const keys = keyValueConstants.HOTKEYS.split(',');

  it('names each key once', () => {
    const repeated = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(repeated).toEqual([]);
  });

  it('still names every key the keypad reads: both sides, the modifiers and the moves', () => {
    const { SIDE1KEYS, SIDE2KEYS, MODIFIERS, MOVEUP, MOVEDOWN } = keyValueConstants;
    for (const key of [...SIDE1KEYS, ...SIDE2KEYS, ...MODIFIERS, ...MOVEUP, ...MOVEDOWN]) {
      expect(keys, key).toContain(key);
    }
  });
});
