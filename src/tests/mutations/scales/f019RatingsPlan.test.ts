import { captureNotices } from '../notifications/noticeConformance/harness';
import { INVALID_SCALE_ITEM, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { generateDynamicRatings } from '@Mutate/participants/scaleItems/generateDynamicRatings';
import { setClock } from '@Tools/clock';
import engine from '@Engines/scaleEngine';
import { afterEach, expect, it } from 'vitest';
import mongoose from 'mongoose';

const method = 'generateDynamicRatings';
const tournamentId = 'ratings';
const clock = 1700000000000;
const itemType = 'SCALE.RATING.SINGLES.ELO';
const ids = ['a', 'b'];
const item = (itemValue: number) => ({ itemType, itemValue, createdAt: new Date(clock).toISOString() });
const participants = () => ids.map((participantId) => ({ participantId, participantType: 'INDIVIDUAL' }));
function runParams() {
  return {
    updateParticipantRatings: true,
    matchUpIds: ['m'],
    matchUps: [
      {
        matchUpId: 'm',
        matchUpType: 'SINGLES',
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 1 }] },
        sides: participants().map((participant, i) => ({ sideNumber: i + 1, participant })),
      },
    ],
  };
}

afterEach(() => {
  setClock();
  engine.setState({ tournamentId: 'reset' });
});

it.each([true, false])('refuses a late TEAM and a missing destination without publishing, deepCopy=%s', (deepCopy) => {
  setClock(clock);
  const players = participants();
  players[1].participantType = 'TEAM';
  const record = { tournamentId, participants: players, factory: { version: 'baseline', timeStamp: clock - 1 } };
  engine.setState(record, deepCopy);
  const before = JSON.stringify(engine.getState());
  const params = runParams();
  const notices = captureNotices(() => {
    expect(engine.generateDynamicRatings(params).error).toEqual(INVALID_SCALE_ITEM);
    expect(JSON.stringify(engine.getState())).toBe(before);
    expect(engine.executionQueue([{ method, params }], false).error?.code).toBe(INVALID_SCALE_ITEM.code);
    expect(JSON.stringify(engine.getState())).toBe(before);
    params.matchUps[0].sides[0].participant.participantId = 'missing';
    expect(engine.generateDynamicRatings(params)).toMatchObject({
      error: PARTICIPANT_NOT_FOUND,
      info: 'ratings not written: missing',
    });
    expect(JSON.stringify(engine.getState())).toBe(before);
  });
  expect(notices).toEqual([]);
});

it.each([true, false])('publishes the rated values and ordered notices, deepCopy=%s', (deepCopy) => {
  setClock(clock);
  const players = participants();
  engine.setState({ tournamentId, participants: players }, deepCopy);
  const params = runParams();
  const values = [1513, 1488];
  const notices = captureNotices(() => {
    expect(engine.generateDynamicRatings(params)).toEqual({
      success: true,
      processedMatchUpIds: ['m'],
      ratedMatchUpIds: ['m'],
      outputScaleName: 'ELO',
      ratingsPolicyNames: ['Elo, Huang 2014 (flat K)'],
      modifiedScaleValues: Object.fromEntries(
        ids.map((id, i) => [
          id,
          {
            scaleName: 'ELO',
            eventType: 'SINGLES',
            scaleType: 'RATING',
            scaleDate: undefined,
            scaleValue: values[i],
          },
        ]),
      ),
    });
  });
  const stored = engine.getTournament().tournamentRecord;
  const updated = participants().map((player, i) => ({ ...player, timeItems: [item(values[i])] }));
  expect(stored.participants).toEqual(updated);
  expect(stored.factory.timeStamp).toBe(clock);
  expect(notices).toEqual([
    { topic: MODIFY_PARTICIPANTS, payload: { tournamentId, participants: updated } },
    {
      topic: MUTATIONS,
      payload: {
        tournamentId: undefined,
        timeStamp: clock,
        directives: [
          {
            method: generateDynamicRatings,
            params: { ...params, activeTournamentId: tournamentId, tournamentRecord: stored },
          },
        ],
      },
    },
  ]);
});

it('initializes absent lists for unrated sides without a change notice or stamp', () => {
  const params = runParams();
  Object.assign(params.matchUps[0], { matchUpStatus: 'DOUBLE_WALKOVER', winningSide: undefined, score: {} });
  engine.setState({ tournamentId, participants: participants() });
  const notices = captureNotices(() => {
    expect(engine.generateDynamicRatings(params)).toMatchObject({
      success: true,
      ratedMatchUpIds: [],
      processedMatchUpIds: ['m'],
    });
  });
  expect(engine.getTournament().tournamentRecord).toEqual({
    tournamentId,
    participants: participants().map((p) => ({ ...p, timeItems: [] })),
  });
  expect(notices).toEqual([]);
});

it('appends in order to a list shared by borrowed participants', () => {
  setClock(clock);
  const shared: ReturnType<typeof item>[] = [];
  const players = participants().map((player) => ({ ...player, timeItems: shared }));
  engine.setState({ tournamentId, participants: players }, false);
  expect(engine.generateDynamicRatings({ ...runParams(), removePriorValues: false }).success).toBe(true);
  expect(shared).toEqual([item(1513), item(1488)]);
});

it('can plan a late refusal against read-only participants', () => {
  const players = participants();
  players[1].participantType = 'TEAM';
  const tournamentRecord = {
    tournamentId,
    participants: players.map((p) => Object.freeze({ ...p, timeItems: Object.freeze([]) })),
  };
  expect(generateDynamicRatings({ ...runParams(), tournamentRecord }).error).toEqual(INVALID_SCALE_ITEM);
});

const timeItemSchema = new mongoose.Schema(
  {
    createdAt: String,
    itemType: String,
    itemValue: { type: Number, set: (value: number) => Math.round(value / 10) * 10 },
  },
  { _id: false },
);
const participantSchema = new mongoose.Schema(
  {
    participantId: String,
    participantType: String,
    timeItems: [timeItemSchema],
  },
  { _id: false },
);
const RatingsDocument = mongoose.model(
  'F019BorrowedRatings',
  new mongoose.Schema({
    tournamentId: String,
    participants: [participantSchema],
    factory: mongoose.Schema.Types.Mixed,
  }),
);

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  'preserves the committed ratings and MongoDB operations, removePriorValues=%s queue=%s',
  (removePriorValues, queue) => {
    setClock(clock);
    const keep = { itemType: 'KEEP', itemValue: 100 };
    const prior = item(1500);
    const players = participants().map((p) => ({ ...p, timeItems: [keep, prior] }));
    const doc = RatingsDocument.hydrate({ tournamentId, participants: players });
    engine.setState(doc, false);
    const params = { ...runParams(), removePriorValues };
    const originalLists = doc.participants.map((p) => p.timeItems);
    const preview = engine.generateDynamicRatings({ ...params, updateParticipantRatings: false });
    expect(ids.map((id) => preview.modifiedScaleValues[id].scaleValue)).toEqual([1513, 1488]);
    expect(doc.$getChanges()).toEqual({});
    const committed = [1510, 1490];
    const stored = committed.map((value) => [...(removePriorValues ? [keep] : [keep, prior]), item(value)]);
    const notices = captureNotices(() => {
      const result = queue
        ? engine.executionQueue([{ method, params }], false).results[0]
        : engine.generateDynamicRatings(params);
      expect(result.success).toBe(true);
      expect(ids.map((id) => result.modifiedScaleValues[id].scaleValue)).toEqual(committed);
    });
    expect(doc.participants.map((p) => p.timeItems.toObject())).toEqual(stored);
    expect(doc.participants.map((p, i) => p.timeItems === originalLists[i])).toEqual([
      !removePriorValues,
      !removePriorValues,
    ]);
    expect(notices.map((n) => n.topic)).toEqual([MODIFY_PARTICIPANTS, MUTATIONS]);
    expect(notices[0].payload.participants.map((p) => p.timeItems.at(-1).itemValue)).toEqual(committed);
    const factory = { version: engine.version(), timeStamp: clock };
    const changes = Object.fromEntries(
      stored.map((items, i) => [
        'participants.' + i + '.timeItems',
        removePriorValues ? items : { $each: [item(committed[i])] },
      ]),
    );
    expect(doc.$getChanges()).toEqual(
      removePriorValues
        ? { $set: { ...changes, factory }, $inc: { __v: 1 } }
        : { $push: changes, $set: { factory }, $inc: { __v: 1 } },
    );
  },
);

it.each(['TEAM', 'missing'])('refuses %s before changing a borrowed document or its pending update', (kind) => {
  setClock(clock);
  const players = participants();
  if (kind === 'TEAM') players[1].participantType = 'TEAM';
  else players.pop();
  const doc = RatingsDocument.hydrate({ tournamentId, participants: players });
  engine.setState(doc, false);
  const before = doc.toObject();
  const expected = kind === 'TEAM' ? INVALID_SCALE_ITEM : PARTICIPANT_NOT_FOUND;
  const notices = captureNotices(() => {
    expect(engine.generateDynamicRatings(runParams()).error).toEqual(expected);
    expect(engine.executionQueue([{ method, params: runParams() }], false).error?.code).toBe(expected.code);
  });
  expect(doc.toObject()).toEqual(before);
  expect(doc.$getChanges()).toEqual({});
  expect(notices).toEqual([]);
});

it('returns each committed append from a shared borrowed document array', () => {
  setClock(clock);
  const owner = RatingsDocument.hydrate({ tournamentId, participants: [{ participantId: 'owner' }] });
  const shared = owner.participants[0].timeItems;
  const players = participants().map((player) => ({ ...player, timeItems: shared }));
  engine.setState({ tournamentId, participants: players }, false);
  const result = engine.generateDynamicRatings({ ...runParams(), removePriorValues: false });
  expect(result.success).toBe(true);
  expect(ids.map((id) => result.modifiedScaleValues[id].scaleValue)).toEqual([1510, 1490]);
  expect(players[0].timeItems).toBe(shared);
  expect(players[1].timeItems).toBe(shared);
  expect(shared.toObject()).toEqual([item(1510), item(1490)]);
  expect(owner.$getChanges()).toEqual({
    $push: { 'participants.0.timeItems': { $each: [item(1510), item(1490)] } },
    $inc: { __v: 1 },
  });
});

it('sees a preceding equivalent rating on an ordinary shared array before validating its date', () => {
  setClock(clock);
  const shared: ReturnType<typeof item>[] = [];
  const extra = ['c', 'd'].map((participantId) => ({ participantId, participantType: 'INDIVIDUAL' }));
  const players = [...participants(), ...extra].map((p, i) => ({ ...p, timeItems: i % 2 ? [] : shared }));
  players[3].timeItems = [item(1500)];
  const params = runParams();
  const second = {
    ...params.matchUps[0],
    matchUpId: 'm2',
    endDate: 'invalid',
    sides: extra.map((participant, i) => ({ participant, sideNumber: i + 1 })),
  };
  engine.setState({ tournamentId, participants: players }, false);
  const notices = captureNotices(() => {
    const result = engine.generateDynamicRatings({
      ...params,
      matchUps: [...params.matchUps, second],
      matchUpIds: ['m', 'm2'],
      removePriorValues: false,
    });
    expect(result.success).toBe(true);
  });
  expect(shared).toEqual([item(1513)]);
  expect(notices[0].payload.participants.map((p) => p.participantId)).toEqual(['a', 'b', 'd']);
});
