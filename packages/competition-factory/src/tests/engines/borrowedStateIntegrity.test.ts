import { registerPreviewMethod } from '@Forge/previewMethods';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import { Decimal128, ObjectId } from 'bson';
import syncEngine from '@Engines/syncEngine';
import {
  cycleMutationStatus,
  deleteNotices,
  getTournamentRecords,
  setDeepCopy,
  setStateProvider,
} from '@Global/state/globalState';

// constants
import { ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';

// Borrowed state: with deep copy off (`setState(record, false)`), the engine works on the caller's
// OWN objects, which the caller then persists. A rollback or preview must therefore restore INTO
// those objects. Installing a copy instead left the caller holding the refused writes while every
// later mutation went to a copy the caller never saw.
//
// Real driver objects, built offline: `bson` value types (what a database driver puts in plain
// results). Values and object identity are asserted separately: restoring one does not establish the other.

const methods = {
  rename: ({ tournamentRecord, name }) => {
    tournamentRecord.tournamentName = name;
    return { success: true };
  },
  rework: ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'reworked';
    tournamentRecord.events[0] = { eventId: 'E1', eventName: 'replacement' };
    tournamentRecord.events.push({ eventId: 'E2', eventName: 'added' });
    delete tournamentRecord.venue;
    tournamentRecord.added = { by: 'the operation' };
    return { success: true };
  },
  refuse: () => ({ error: { message: 'refused', code: 'ERR_REFUSED' } }),
};
syncEngine.importMethods(methods);
registerPreviewMethod(syncEngine, methods.rename, methods.rename);
registerPreviewMethod(syncEngine, methods.rework, methods.rework);

const plainRecord = () => ({
  tournamentId: 'T',
  tournamentName: 'original',
  _id: new ObjectId(),
  fee: Decimal128.fromString('12.50'),
  events: [{ eventId: 'E1', eventName: 'first' }],
  venue: { venueId: 'V1', venueName: 'courts' },
});

beforeEach(() => {
  setStateProvider(syncGlobalState);
  deleteNotices();
  cycleMutationStatus();
});

afterEach(() => {
  setStateProvider(syncGlobalState);
  setDeepCopy(true, { ignore: [] });
  syncEngine.setState({ tournamentId: 'X', tournamentName: 'reset' }, true);
});

describe('a plain record the caller owns', () => {
  it('a refused queue restores the values in the caller’s own objects, and the engine keeps them', () => {
    const doc = plainRecord();
    const { events, venue, _id, fee } = doc;
    const firstEvent = events[0];
    syncEngine.setState(doc, false);

    const result: any = syncEngine.executionQueue([{ method: 'rework' }, { method: 'refuse' }], true);
    expect(result.rolledBack).toEqual(true);

    // values
    expect(doc.tournamentName).toEqual('original');
    expect(doc.events).toEqual([{ eventId: 'E1', eventName: 'first' }]);
    expect(doc.venue).toEqual({ venueId: 'V1', venueName: 'courts' });
    expect('added' in doc).toEqual(false);
    // identity: nested objects the operation replaced or deleted are the caller's originals again
    expect(doc.events).toBe(events);
    expect(doc.events[0]).toBe(firstEvent);
    expect(doc.venue).toBe(venue);
    // driver values are kept by reference, never walked into plain objects
    expect(doc._id).toBe(_id);
    expect(doc.fee).toBe(fee);
    expect(doc._id).toBeInstanceOf(ObjectId);
    // the engine still holds the caller's object, so the next write reaches it
    expect(getTournamentRecords().T).toBe(doc);
    syncEngine.executionQueue([{ method: 'rename', params: { name: 'committed' } }]);
    expect(doc.tournamentName).toEqual('committed');
  });

  it('a preview leaves the caller’s object unchanged, and the engine keeps it', () => {
    const doc = plainRecord();
    const firstEvent = doc.events[0];
    syncEngine.setState(doc, false);

    const result: any = syncEngine.dryRun([{ method: 'rework' }]);
    expect(result.wouldSucceed).toEqual(true);
    expect(result.patch.length).toBeGreaterThan(0);

    expect(doc.tournamentName).toEqual('original');
    expect(doc.events[0]).toBe(firstEvent);
    expect(doc.venue).toEqual({ venueId: 'V1', venueName: 'courts' });
    expect(getTournamentRecords().T).toBe(doc);
  });

  it('a Date the operation changed in place is the same Date again, with its original time', () => {
    const scheduled = new Date('2026-10-14T09:00:00Z');
    const doc: any = { ...plainRecord(), scheduled };
    syncEngine.setState(doc, false);
    const reschedule = ({ tournamentRecord }) => {
      tournamentRecord.scheduled.setTime(0);
      return { error: { message: 'refused', code: 'ERR_REFUSED' } };
    };
    syncEngine.execute({ reschedule, rollbackOnError: true });
    expect(doc.scheduled).toBe(scheduled);
    expect(scheduled.toISOString()).toEqual('2026-10-14T09:00:00.000Z');
  });

  it('a subtree listed in `ignore` is still restored', () => {
    const doc = plainRecord();
    syncEngine.setState(doc, false, { ignore: ['venue', 'events'] });
    const venue = doc.venue;
    syncEngine.executionQueue([{ method: 'rework' }, { method: 'refuse' }], true);
    expect(doc.venue).toBe(venue);
    expect(doc.events).toEqual([{ eventId: 'E1', eventName: 'first' }]);
  });
});

describe('a provider copy hook that predates `purpose`', () => {
  it('keeps working when the engine owns the records', () => {
    setStateProvider({ ...syncGlobalState, makeDeepCopy: (source) => structuredClone(source) });
    syncEngine.setState({ tournamentId: 'T', tournamentName: 'original' });
    const result: any = syncEngine.executionQueue(
      [{ method: 'rename', params: { name: 'refused' } }, { method: 'refuse' }],
      true,
    );
    expect(result.rolledBack).toEqual(true);
    expect(syncEngine.getTournament().tournamentRecord.tournamentName).toEqual('original');
  });

  it('is refused in borrowed mode, where nothing could restore into the caller’s objects', () => {
    setStateProvider({ ...syncGlobalState, makeDeepCopy: (source) => structuredClone(source) });
    const doc = { tournamentId: 'T', tournamentName: 'original' };
    syncEngine.setState(doc, false);
    const result: any = syncEngine.executionQueue([{ method: 'rename', params: { name: 'refused' } }], true);
    expect(result.error).toEqual(ROLLBACK_UNAVAILABLE);
    expect(doc.tournamentName).toEqual('original');
  });

  it('is refused when it hands back the live records instead of a copy', () => {
    setStateProvider({ ...syncGlobalState, makeDeepCopy: (source) => source });
    syncEngine.setState({ tournamentId: 'T', tournamentName: 'original' });
    const result: any = syncEngine.executionQueue([{ method: 'rename', params: { name: 'refused' } }], true);
    expect(result.error).toEqual(ROLLBACK_UNAVAILABLE);
    expect(syncEngine.getTournament().tournamentRecord.tournamentName).toEqual('original');
  });
});
