import { addedNotices } from '@Mutate/matchUps/outcome/shadow';
import { describe, expect, it } from 'vitest';

/**
 * The differential compares the notices v1 added in a call with the ones v2 planned. A notice that supersedes one already
 * buffered under its topic and key replaces it at the end of the buffer, which does not grow: so what a call added is
 * every entry that was not there before, not the tail past the earlier length (a mocks scenario built through engine
 * calls leaves its notices in the buffer, #5930).
 */
describe('addedNotices', () => {
  const a = { topic: 'modifyMatchUp', key: 'a' };
  const b = { topic: 'modifyMatchUp', key: 'b' };

  it('a notice superseding one already buffered is added, though the buffer did not grow', () => {
    const superseding = { topic: 'modifyMatchUp', key: 'a' };
    expect(addedNotices([a, b], [b, superseding])).toEqual([superseding]);
  });

  it('a new key is added; an entry kept as it was is not', () => {
    const c = { topic: 'modifyDrawDefinition', key: 'd' };
    expect(addedNotices([a], [a, c])).toEqual([c]);
    expect(addedNotices([a, b], [a, b])).toEqual([]);
  });

  it('an empty or missing buffer before: everything after was added', () => {
    expect(addedNotices(undefined, [a])).toEqual([a]);
    expect(addedNotices([a], undefined)).toEqual([]);
  });
});
