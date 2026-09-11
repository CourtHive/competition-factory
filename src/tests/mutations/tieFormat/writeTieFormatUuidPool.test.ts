import { writeTieFormat } from '@Mutate/tieFormat/writeTieFormat';
import { describe, expect, it } from 'vitest';

// constants
import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';

/**
 * `writeTieFormat`'s copy-on-write fork, tested DIRECTLY.
 *
 * Why at this level rather than through a mutation. The fork fires only when a
 * centralized `tieFormatId` is shared by more than one reference (`refCount > 1`).
 * A full-suite sweep — instrumenting the fork and running all 10,912 tests —
 * showed it is reached from exactly ONE call site in the entire corpus:
 * `removeCollectionDefinition`'s `processTargetMatchUp` path. The main-chain
 * write sites in `removeCollectionDefinition`, `addCollectionDefinition` and
 * `collectionGroupUpdate` never reach it, because the matchUp-level processing
 * re-points every competing reference first, leaving `refCount === 1` by the time
 * the main-chain write runs — so those writes take the in-place branch.
 *
 * That makes the pool behaviour untestable from those callers. Testing the fork
 * where it actually lives covers the logic that matters — does a supplied pool
 * get used, and does exhaustion fail loudly — independently of which caller
 * happens to reach it today.
 *
 * The fixtures are hand-built ON PURPOSE here, which is the opposite of the
 * sibling integration test's approach and is the right call at this level: the
 * point is to exercise `writeTieFormat`'s own branches, and `refCount` is just a
 * count over `event` — so constructing the shape directly is honest rather than
 * contrived.
 */

const SHARED_ID = 'shared-tf-1';

/** An event whose centralized tieFormat is referenced by `references` targets. */
function eventWithSharedTieFormat(references: number) {
  const structures = Array.from({ length: Math.max(0, references - 1) }, (_x, i) => ({
    structureId: `s-${i}`,
    tieFormatId: SHARED_ID,
    matchUps: [], // countTieFormatReferences walks event matchUps; a structure without this throws
  }));
  return {
    eventId: 'e-1',
    tieFormatId: SHARED_ID, // reference #1
    tieFormats: [{ tieFormatId: SHARED_ID, collectionDefinitions: [{ collectionId: 'c-1' }] }],
    drawDefinitions: [{ drawId: 'd-1', structures }],
  };
}

const modifiedTieFormat = { collectionDefinitions: [{ collectionId: 'c-1' }, { collectionId: 'c-2' }] };

describe('writeTieFormat — uuids pool on the copy-on-write fork', () => {
  it('takes the forked id FROM the pool when one is supplied', () => {
    const event: any = eventWithSharedTieFormat(2);
    const target: any = { tieFormatId: SHARED_ID };
    const uuids = ['pooled-tf-id'];

    const result = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids });

    expect(result?.error).toBeUndefined();
    // the value came from the caller, which is what makes a replay reproducible
    expect(target.tieFormatId).toEqual('pooled-tf-id');
    expect(uuids).toHaveLength(0); // consumed, not copied
    expect(event.tieFormats.map((tf: any) => tf.tieFormatId)).toEqual([SHARED_ID, 'pooled-tf-id']);
    // the fork replaces the reference; the inline copy must not linger alongside it
    expect(target.tieFormat).toBeUndefined();
  });

  it('errors rather than minting when the supplied pool is exhausted', () => {
    const event: any = eventWithSharedTieFormat(2);
    const target: any = { tieFormatId: SHARED_ID };

    const result = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids: [] });

    expect(result?.error).toEqual(INSUFFICIENT_UUIDS);
    // and it left the target alone — a failed write must not half-apply
    expect(target.tieFormatId).toEqual(SHARED_ID);
    expect(event.tieFormats).toHaveLength(1);
  });

  it('mints when NO pool is supplied — absent is not empty', () => {
    const event: any = eventWithSharedTieFormat(2);
    const target: any = { tieFormatId: SHARED_ID };

    const result = writeTieFormat({ target, tieFormat: modifiedTieFormat, event });

    expect(result?.error).toBeUndefined();
    expect(target.tieFormatId).not.toEqual(SHARED_ID); // forked to a minted id
    expect(event.tieFormats).toHaveLength(2);
  });

  // This branch is why the main-chain callers cannot reach the fork: with a single
  // reference the centralized entry is updated in place and no id is minted at all.
  // Pinning it documents the reachability finding as behaviour rather than a comment.
  it('updates in place and consumes NOTHING when only one reference exists', () => {
    const event: any = eventWithSharedTieFormat(1);
    const target: any = { tieFormatId: SHARED_ID };
    const uuids = ['must-not-be-used'];

    const result = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids });

    expect(result?.error).toBeUndefined();
    expect(target.tieFormatId).toEqual(SHARED_ID); // unchanged — no fork
    expect(uuids).toEqual(['must-not-be-used']); // pool untouched
    expect(event.tieFormats).toHaveLength(1);
    expect(event.tieFormats[0].collectionDefinitions).toHaveLength(2); // updated in place
  });

  // The pre-aggregation shape: no centralized reference at all, so the pool is
  // irrelevant and the format is written inline.
  it('writes inline and consumes nothing when the target has no tieFormatId', () => {
    const event: any = eventWithSharedTieFormat(2);
    const target: any = {};
    const uuids = ['must-not-be-used'];

    const result = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids });

    expect(result?.error).toBeUndefined();
    expect(target.tieFormat).toEqual(modifiedTieFormat);
    expect(uuids).toEqual(['must-not-be-used']);
  });
});
