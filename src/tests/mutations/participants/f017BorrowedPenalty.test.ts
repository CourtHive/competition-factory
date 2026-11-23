import { captureNotices } from '../notifications/noticeConformance/harness';
import { MODIFY_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { PENALTY_NOT_FOUND } from '@Constants/errorConditionConstants';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { afterEach, expect, it } from 'vitest';
import mongoose from 'mongoose';

const penalty = new mongoose.Schema({ penaltyId: String, notes: { type: String, trim: true } }, { _id: false });
const player = new mongoose.Schema(
  {
    participantId: String,
    penalties: {
      type: [penalty],
      default: undefined,
      set: (entries: { penaltyId: string; notes: string }[]) =>
        entries?.map(({ penaltyId, notes }) => ({ penaltyId, notes: notes.toUpperCase() })),
    },
  },
  { _id: false },
);
const Model = mongoose.model(
  'F017BorrowedPenalty',
  new mongoose.Schema({
    tournamentId: String,
    participants: [player],
    factory: mongoose.Schema.Types.Mixed,
  }),
);
const timeStamp = 1700000000000;
afterEach(() => {
  setClock();
  engine.setState({ tournamentId: 'reset' });
});

it.each(['direct', 'queue'])('reads the committed penalty and preserves document updates through %s', (route) => {
  setClock(timeStamp);
  const doc = Model.hydrate({
    tournamentId: 'T',
    participants: [{ participantId: 'a' }, { participantId: 'b', penalties: [{ penaltyId: 'p', notes: 'before' }] }],
  });
  engine.setState(doc, false);
  function edit(penaltyId: string) {
    const params = { penaltyId, modifications: { notes: ' new ' } };
    if (route === 'direct') return engine.modifyPenalty(params);
    const queue = engine.executionQueue([{ method: 'modifyPenalty', params }], false);
    return queue.error ? queue : queue.results[0];
  }
  const before = doc.toObject();
  const dirty = doc.$getChanges();
  expect(captureNotices(() => expect(edit('absent').error).toEqual(PENALTY_NOT_FOUND))).toEqual([]);
  expect(doc.toObject()).toEqual(before);
  expect(doc.$getChanges()).toEqual(dirty);

  const notices = captureNotices(() => {
    const result = edit('p');
    expect(result.success).toBe(true);
    expect(result.penalty.notes).toBe('NEW');
  });
  expect(doc.participants[1].penalties?.[0].notes).toBe('NEW');
  expect(notices.map((n) => n.topic)).toEqual([MODIFY_PARTICIPANTS, MUTATIONS]);
  expect(notices[0].payload.participants[0].penalties[0].notes).toBe('NEW');
  expect(doc.$getChanges()).toEqual({
    $set: {
      'participants.0.penalties': [],
      'participants.1.penalties': [{ penaltyId: 'p', notes: 'NEW' }],
      factory: { version: engine.version(), timeStamp },
    },
    $inc: { __v: 1 },
  });
});
