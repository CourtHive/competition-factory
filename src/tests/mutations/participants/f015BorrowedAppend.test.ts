import tournamentEngine from '@Engines/syncEngine';
import { INVALID_DATE } from '@Constants/errorConditionConstants';
import { afterEach, expect, it } from 'vitest';
import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({ itemType: String, createdAt: String, itemValue: Number }, { _id: false });
const playerSchema = new mongoose.Schema({ participantId: String, timeItems: [itemSchema] }, { _id: false });
const Tournament = mongoose.model(
  'F015BorrowedAppend',
  new mongoose.Schema({ tournamentId: String, participants: [playerSchema] }),
);
const method = 'setParticipantScaleItem';
const params = {
  participantId: 'p',
  scaleItem: {
    scaleType: 'RANKING',
    scaleName: 'U18',
    eventType: 'SINGLES',
    createdAt: '2026-10-01T00:00:00.000Z',
    scaleValue: 1,
  },
};
const storedItem = { itemType: 'SCALE.RANKING.SINGLES.U18', itemValue: 1, createdAt: params.scaleItem.createdAt };

afterEach(() => tournamentEngine.setState({ tournamentId: 'reset' }, true));

it.each([false, true])('appends through the borrowed document array, queue=%s', (queue) => {
  const doc = Tournament.hydrate({ tournamentId: 'T', participants: [{ participantId: 'p', timeItems: [] }] });
  const list = doc.participants[0].timeItems;
  tournamentEngine.setState(doc, false);
  const invalid = { ...params, scaleItem: { ...params.scaleItem, scaleDate: 'invalid' } };
  const before = JSON.stringify(doc);
  const refusal = queue
    ? tournamentEngine.executionQueue([{ method, params: invalid }], false)
    : tournamentEngine.setParticipantScaleItem(invalid);
  expect(refusal.error?.code).toBe(INVALID_DATE.code);
  expect(JSON.stringify(doc)).toBe(before);
  expect(doc.modifiedPaths()).toEqual([]);

  const result = queue
    ? tournamentEngine.executionQueue([{ method, params }], false)
    : tournamentEngine.setParticipantScaleItem(params);
  expect(result.success).toBe(true);
  expect(doc.participants[0].timeItems).toBe(list);
  expect(list.toObject()).toEqual([storedItem]);
  expect(doc.$getChanges()).toEqual({
    $push: { 'participants.0.timeItems': { $each: [storedItem] } },
    $inc: { __v: 1 },
  });
});

it.each([
  { existing: true, removePriorValues: true },
  { existing: false, removePriorValues: false },
  { existing: false, removePriorValues: true },
])(
  'pushes after the setter installs an array, existing=$existing removePriorValues=$removePriorValues',
  ({ existing, removePriorValues }) => {
    const calls: string[] = [];
    const supplied = { ...storedItem, itemType: 'example.other' };
    let items: (typeof storedItem)[] | undefined = existing ? [storedItem] : undefined;
    const participant = {
      participantId: 'p',
      get timeItems() {
        return items;
      },
      set timeItems(value) {
        calls.push('set ' + value?.length);
        const firstAssignment = !items;
        items = value?.slice();
        if (firstAssignment) items?.push(supplied);
        if (items) {
          const installed = items;
          Object.defineProperty(installed, 'push', {
            value: (...values: (typeof storedItem)[]) => {
              calls.push('push');
              return Array.prototype.push.apply(installed, values);
            },
          });
        }
      },
    };
    tournamentEngine.setState({ tournamentId: 'T', participants: [participant] }, false);
    expect(
      tournamentEngine.setParticipantScaleItem({
        ...params,
        scaleItem: { ...params.scaleItem, scaleValue: 2 },
        removePriorValues,
      }).success,
    ).toBe(true);
    expect(calls).toEqual(!existing && removePriorValues ? ['set 0', 'set 1', 'push'] : ['set 0', 'push']);
    expect(items).toEqual([...(existing ? [] : [supplied]), { ...storedItem, itemValue: 2 }]);
  },
);

it('returns the scale value committed by a borrowed time-item setter', () => {
  const canonicalItem = itemSchema.clone();
  canonicalItem.path('itemValue').set((value: number) => Math.round(value));
  const player = new mongoose.Schema({ participantId: String, timeItems: [canonicalItem] }, { _id: false });
  const Canonical = mongoose.model(
    'F015CanonicalScale',
    new mongoose.Schema({ tournamentId: String, participants: [player] }),
  );
  const doc = Canonical.hydrate({ tournamentId: 'T', participants: [{ participantId: 'p', timeItems: [] }] });
  tournamentEngine.setState(doc, false);
  const result = tournamentEngine.setParticipantScaleItem({
    ...params,
    scaleItem: { ...params.scaleItem, scaleValue: 1.4 },
  });
  expect(doc.participants[0].timeItems[0].itemValue).toBe(1);
  expect(result).toEqual({ success: true, newValue: 1 });
});
