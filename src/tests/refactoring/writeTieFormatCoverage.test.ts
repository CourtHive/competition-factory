import { writeTieFormat, removeOrphanedTieFormats } from '@Mutate/tieFormat/writeTieFormat';
import { describe, it, expect } from 'vitest';

function makeTieFormat(id?: string) {
  return {
    tieFormatId: id,
    tieFormatName: 'Test Format',
    winCriteria: { valueGoal: 2 },
    collectionDefinitions: [],
  } as any;
}

function makeEvent(overrides?: any) {
  return {
    eventId: 'e1',
    drawDefinitions: [],
    ...overrides,
  } as any;
}

describe('writeTieFormat', () => {
  it('does nothing when target is falsy', () => {
    writeTieFormat({ target: undefined as any, tieFormat: makeTieFormat() });
    // no error thrown
  });

  it('writes inline when target has no tieFormatId', () => {
    const target: any = {};
    const tieFormat = makeTieFormat();
    writeTieFormat({ target, tieFormat });
    expect(target.tieFormat).toBe(tieFormat);
  });

  it('writes inline when target has tieFormatId but event has no tieFormats', () => {
    const target: any = { tieFormatId: 'tf-1' };
    const tieFormat = makeTieFormat();
    const event = makeEvent();
    writeTieFormat({ target, tieFormat, event });
    expect(target.tieFormat).toBe(tieFormat);
  });

  it('writes inline when target has tieFormatId but no event provided', () => {
    const target: any = { tieFormatId: 'tf-1' };
    const tieFormat = makeTieFormat();
    writeTieFormat({ target, tieFormat });
    expect(target.tieFormat).toBe(tieFormat);
  });

  it('updates centralized entry in-place when refCount <= 1', () => {
    const centralFormat = makeTieFormat('tf-1');
    const event = makeEvent({
      tieFormats: [centralFormat],
      drawDefinitions: [],
    });
    const target: any = { tieFormatId: 'tf-1' };
    const newFormat = makeTieFormat();
    newFormat.tieFormatName = 'Updated';

    writeTieFormat({ target, tieFormat: newFormat, event });

    // Centralized entry updated in-place
    expect(event.tieFormats[0].tieFormatName).toEqual('Updated');
    expect(event.tieFormats[0].tieFormatId).toEqual('tf-1');
    // Target keeps same ID, no inline tieFormat written
    expect(target.tieFormatId).toEqual('tf-1');
    expect(target.tieFormat).toBeUndefined();
  });

  it('creates new centralized entry when multiple references share the ID', () => {
    const centralFormat = makeTieFormat('tf-shared');
    const event = makeEvent({
      tieFormatId: 'tf-shared', // event itself references it
      tieFormats: [centralFormat],
      drawDefinitions: [{ drawId: 'd1', tieFormatId: 'tf-shared', structures: [] }],
    });
    const target: any = { tieFormatId: 'tf-shared' };
    const newFormat = makeTieFormat();
    newFormat.tieFormatName = 'Forked';

    writeTieFormat({ target, tieFormat: newFormat, event });

    // New entry created
    expect(event.tieFormats.length).toEqual(2);
    expect(event.tieFormats[0].tieFormatId).toEqual('tf-shared');
    // Target now points to new ID
    expect(target.tieFormatId).not.toEqual('tf-shared');
    expect(target.tieFormat).toBeUndefined();
    // New format has the forked name
    const newEntry = event.tieFormats.find((tf: any) => tf.tieFormatId === target.tieFormatId);
    expect(newEntry.tieFormatName).toEqual('Forked');
  });

  it('counts structure-level references', () => {
    const centralFormat = makeTieFormat('tf-struct');
    const event = makeEvent({
      tieFormats: [centralFormat],
      drawDefinitions: [
        {
          drawId: 'd1',
          structures: [{ structureId: 's1', tieFormatId: 'tf-struct', matchUps: [] }],
        },
      ],
    });
    // Structure references it, so refCount = 1 (structure) + target = at least 1 beyond target
    // But target also has it, so the count includes: structure(1) = 1 aside from target
    // Actually countTieFormatReferences counts ALL refs including the target's
    // target.tieFormatId = 'tf-struct' is not counted (only event hierarchy is counted)
    // structure has it = 1, so refCount=1, update in-place
    const target: any = { tieFormatId: 'tf-struct' };
    const newFormat = makeTieFormat();

    writeTieFormat({ target, tieFormat: newFormat, event });
    // refCount = 1 (structure), so in-place update

    // refCount = 1 (structure), so in-place update
    // Wait — the structure refs it AND the target refs it. But countTieFormatReferences
    // only counts event hierarchy, not the target itself. So structure = 1 ref.
    // Since 1 <= 1, it updates in-place.
    expect(event.tieFormats[0].tieFormatId).toEqual('tf-struct');
  });

  it('handles existingIndex not found gracefully (falls through to fork)', () => {
    // tieFormatId on target exists but not in tieFormats array
    const event = makeEvent({
      tieFormats: [makeTieFormat('tf-other')],
      drawDefinitions: [],
    });
    const target: any = { tieFormatId: 'tf-missing' };
    const newFormat = makeTieFormat();

    writeTieFormat({ target, tieFormat: newFormat, event });

    // existingIndex = -1, falls through refCount<=1 block without returning
    // Then hits the fork path: creates new entry
    expect(event.tieFormats.length).toEqual(2);
    expect(target.tieFormatId).not.toEqual('tf-missing');
    expect(target.tieFormat).toBeUndefined();
  });
});

describe('countTieFormatReferences (via writeTieFormat)', () => {
  it('counts event-level reference', () => {
    const centralFormat = makeTieFormat('tf-ev');
    const event = makeEvent({
      tieFormatId: 'tf-ev',
      tieFormats: [centralFormat],
    });
    // event itself + drawDef that also refs it = 2 refs → fork
    const target: any = { tieFormatId: 'tf-ev' };
    event.drawDefinitions = [{ drawId: 'd1', tieFormatId: 'tf-ev', structures: [] }];

    writeTieFormat({ target, tieFormat: makeTieFormat(), event });
    // 2 refs → new entry created
    expect(event.tieFormats.length).toEqual(2);
  });

  it('counts drawDefinition-level reference', () => {
    const centralFormat = makeTieFormat('tf-dd');
    const event = makeEvent({
      tieFormats: [centralFormat],
      drawDefinitions: [
        { drawId: 'd1', tieFormatId: 'tf-dd', structures: [] },
        { drawId: 'd2', tieFormatId: 'tf-dd', structures: [] },
      ],
    });
    const target: any = { tieFormatId: 'tf-dd' };

    writeTieFormat({ target, tieFormat: makeTieFormat(), event });
    // 2 drawDef refs → fork
    expect(event.tieFormats.length).toEqual(2);
  });
});

describe('removeOrphanedTieFormats', () => {
  it('does nothing when event has no tieFormats', () => {
    const event = makeEvent();
    removeOrphanedTieFormats({ event });
    expect(event.tieFormats).toBeUndefined();
  });

  it('does nothing when tieFormats is empty array', () => {
    const event = makeEvent({ tieFormats: [] });
    removeOrphanedTieFormats({ event });
    // empty array is falsy for .length check
  });

  it('removes orphaned tieFormats not referenced by anything', () => {
    const event = makeEvent({
      tieFormats: [makeTieFormat('tf-orphan'), makeTieFormat('tf-used')],
      tieFormatId: 'tf-used',
    });

    removeOrphanedTieFormats({ event });

    expect(event.tieFormats.length).toEqual(1);
    expect(event.tieFormats[0].tieFormatId).toEqual('tf-used');
  });

  it('keeps tieFormats referenced by drawDefinitions', () => {
    const event = makeEvent({
      tieFormats: [makeTieFormat('tf-draw')],
      drawDefinitions: [{ drawId: 'd1', tieFormatId: 'tf-draw', structures: [] }],
    });

    removeOrphanedTieFormats({ event });

    expect(event.tieFormats.length).toEqual(1);
  });

  it('keeps tieFormats referenced by structures', () => {
    const event = makeEvent({
      tieFormats: [makeTieFormat('tf-struct')],
      drawDefinitions: [
        {
          drawId: 'd1',
          structures: [{ structureId: 's1', tieFormatId: 'tf-struct', matchUps: [] }],
        },
      ],
    });

    removeOrphanedTieFormats({ event });

    expect(event.tieFormats.length).toEqual(1);
  });

  it('deletes tieFormats property when all entries are orphaned', () => {
    const event = makeEvent({
      tieFormats: [makeTieFormat('tf-a'), makeTieFormat('tf-b')],
    });

    removeOrphanedTieFormats({ event });

    expect(event.tieFormats).toBeUndefined();
  });

  it('removes format with no tieFormatId', () => {
    const event = makeEvent({
      tieFormats: [makeTieFormat(undefined), makeTieFormat('tf-ref')],
      tieFormatId: 'tf-ref',
    });

    removeOrphanedTieFormats({ event });

    expect(event.tieFormats.length).toEqual(1);
    expect(event.tieFormats[0].tieFormatId).toEqual('tf-ref');
  });

  it('handles event with no drawDefinitions', () => {
    const event: any = {
      eventId: 'e1',
      tieFormatId: 'tf-ev',
      tieFormats: [makeTieFormat('tf-ev')],
    };

    removeOrphanedTieFormats({ event });

    expect(event.tieFormats.length).toEqual(1);
  });
});
