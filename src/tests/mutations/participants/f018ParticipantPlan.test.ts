import { addParticipant, planAddParticipant } from '@Mutate/participants/addParticipant';
import { captureNotices } from '../notifications/noticeConformance/harness';
import { indexParticipants } from '@Mutate/participants/participantsIndex';
import { ADD_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { afterEach, expect, it } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import mongoose from 'mongoose';

const method = 'addParticipant';
const tournamentId = 'tournament';
const timeStamp = Date.UTC(2026, 10, 21);
const role = { participantRole: 'COMPETITOR' };
const individual = { ...role, participantType: 'INDIVIDUAL' };
const pair = { ...role, participantType: 'PAIR' };
const team = { ...role, participantType: 'TEAM' };
const record = () => engine.getTournament().tournamentRecord;

afterEach(() => {
  setClock();
  engine.setState({ tournamentId: 'reset' });
});

it.each([true, false])('keeps complete records and silence for each refusal, copy=%s', (copy) => {
  const person = { sex: 'F', standardFamilyName: ' Smith ' };
  const aliased = { ...individual, participantId: 'A', participantName: 'A', person };
  const populated = {
    tournamentId,
    participants: [aliased],
    extensions: [{ name: 'individualParticipantMerges', value: { version: 1, aliases: { retired: 'A' } } }],
  };
  for (const initial of [{ tournamentId }, populated]) {
    engine.setState(initial, copy);
    const cases: [unknown, string][] = [
      [{}, 'ERR_INVALID_PARTICIPANT_TYPE'],
      [{ participantType: 'TEAM' }, 'ERR_MISSING_PARTICIPANT_ROLE'],
      [{ ...team, person }, 'ERR_INVALID_VALUES'],
      [{ ...individual, person }, 'ERR_MISSING_PERSON_DETAILS'],
      [{ ...individual, person: { sex: 'ANY' } }, 'ERR_INVALID_VALUES'],
      [{ ...pair, individualParticipantIds: 'A' }, 'ERR_INVALID_VALUES'],
      [pair, 'ERR_MISSING_PARTICIPANT_IDS'],
      [{ ...pair, individualParticipantIds: ['A'] }, 'ERR_INVALID_PARTICIPANT_IDS'],
      [{ ...pair, individualParticipantIds: ['A', 'missing'] }, 'ERR_INVALID_PARTICIPANT_IDS'],
      [{ ...team, gender: 'F', individualParticipantIds: [7] }, 'ERR_INVALID_VALUES'],
      [{ ...team, individualParticipantIds: ['unknown'] }, 'ERR_NOT_FOUND_PARTICIPANT'],
      [{ ...individual, teamColors: {} }, 'ERR_INVALID_PARTICIPANT_TYPE'],
    ];
    if (initial === populated)
      cases.push(
        [aliased, 'ERR_EXISTING_PARTICIPANT_ID'],
        [{ ...individual, participantId: 'retired' }, 'PARTICIPANT_ID_RETIRED'],
      );
    for (const [participant, code] of cases) {
      for (const queue of [false, true]) {
        const before = JSON.stringify(record());
        const input = JSON.stringify(participant);
        const params = { participant };
        const notices = captureNotices(() => {
          const result = queue ? engine.executionQueue([{ method, params }], false) : engine.addParticipant(params);
          expect(result.error?.code).toBe(code);
        });
        expect(JSON.stringify(record())).toBe(before);
        expect(JSON.stringify(participant)).toBe(input);
        expect(notices).toEqual([]);
      }
    }
  }
});

it.each([true, false])('adds the normalized participant and announces the committed state, copy=%s', (copy) => {
  setClock(timeStamp);
  for (const queue of [true, false]) {
    const participants = [];
    engine.setState({ tournamentId, participants }, copy);
    const person = { standardGivenName: '  Ann ', standardFamilyName: ' Li ', sex: 'F' };
    const participant = { ...individual, person, participantId: 'P' };
    const expected = {
      ...individual,
      participantId: 'P',
      participantName: 'Ann Li',
      person: { standardGivenName: 'Ann', standardFamilyName: 'Li', sex: 'FEMALE' },
    };
    const params = { participant, returnParticipant: true };
    const directive = { method, params };
    const notices = captureNotices(() => {
      const result = queue ? engine.executionQueue([directive], false) : engine.addParticipant(params);
      const added = { success: true, participant: expected };
      expect(result).toEqual(queue ? { success: true, results: [{ ...added, methodName: method }] } : added);
    });
    const stored = record();
    expect(stored.participants).toEqual([expected]);
    expect(stored.factory.timeStamp).toBe(timeStamp);
    if (!copy) {
      expect(stored.participants).toBe(participants);
      expect(stored.participants[0]).toBe(participant);
      expect(stored.participants[0].person).toBe(person);
    }
    const direct = {
      method: addParticipant,
      params: { ...params, activeTournamentId: tournamentId, tournamentRecord: stored },
    };
    expect(notices).toEqual([
      { topic: ADD_PARTICIPANTS, payload: { tournamentId, participants: [expected] } },
      { topic: MUTATIONS, payload: { tournamentId: undefined, timeStamp, directives: [queue ? directive : direct] } },
    ]);
  }
});

it('binds the generated ID and index without editing either input during planning', () => {
  const participants = [];
  const tournamentRecord = { tournamentId, participants };
  const participantsIndex = indexParticipants(participants)!;
  const participant = { ...team, gender: 'F' };
  const plan = planAddParticipant({ tournamentRecord, participant, participantsIndex, returnParticipant: true });
  expect(participant).toEqual({ ...team, gender: 'F' });
  expect(participantsIndex.ids.size).toBe(0);
  expect(participants).toEqual([]);
  for (const write of plan.writes!) write();
  expect(participants[0]).toBe(participant);
  const result = plan.committedResult!();
  expect(result.participant).toEqual({
    ...team,
    gender: 'FEMALE',
    individualParticipantIds: [],
    participantId: expect.any(String),
  });
  expect(participantsIndex.positions.get(result.participant.participantId)).toBe(0);
});

it.each([true, false])(
  'preserves pair override, duplicate reuse and the explicit duplicate option, copy=%s',
  (copy) => {
    const participants = ['A', 'B', 'C'].map((id) => ({ ...individual, participantId: id, participantName: id }));
    engine.setState({ tournamentId, participants }, copy);
    const members = ['C', 'A', 'B'];
    const irregular = { ...pair, participantId: 'odd', individualParticipantIds: members };
    const first = engine.addParticipant({ participant: irregular, pairOverride: true, returnParticipant: true });
    expect(first.success).toBe(true);
    expect(first.participant).toEqual(record().participants.at(-1));
    expect(record().participants.at(-1).individualParticipantIds).toEqual(members);
    const normal = { ...pair, individualParticipantIds: ['B', 'A'] };
    const before = JSON.stringify(record());
    const notices = captureNotices(() => {
      expect(engine.addParticipant({ participant: normal, returnParticipant: true })).toEqual({
        success: true,
        existingParticipant: true,
        participant: first.participant,
      });
    });
    expect(JSON.stringify(record())).toBe(before);
    expect(notices).toEqual([]);
    const distinct = engine.addParticipant({
      participant: normal,
      allowDuplicateParticipantIdPairs: true,
      returnParticipant: true,
    });
    expect(distinct.participant.participantId).toEqual(expect.any(String));
    expect(distinct.participant.participantId).not.toBe('odd');
    expect(record().participants).toHaveLength(5);
  },
);

it('retains the append operation on a borrowed Mongoose document array', () => {
  const model =
    mongoose.models.F018Roster ??
    mongoose.model(
      'F018Roster',
      new mongoose.Schema({
        tournamentId: String,
        participants: [
          new mongoose.Schema(
            { participantId: String, participantName: String, participantType: String, participantRole: String },
            { _id: false },
          ),
        ],
      }),
    );
  const doc = model.hydrate({ tournamentId, participants: [] });
  const list = doc.participants;
  engine.setState(doc, false);
  const participant = { ...individual, participantId: 'P', participantName: 'Player' };
  expect(engine.addParticipant({ participant }).success).toBe(true);
  expect(doc.participants).toBe(list);
  expect(doc.$getChanges()).toEqual({
    $push: { participants: { $each: [expect.objectContaining(participant)] } },
    $inc: { __v: 1 },
  });
});

it.each([true, false])('uses the committed hydrated name in results and notices, copy=%s', (copy) => {
  const assigned: string[] = [];
  const tracked = (key: string, normalize = (value: string) => value) => ({
    type: String,
    set(value: string) {
      assigned.push(key);
      return normalize(value);
    },
  });
  const Player = mongoose.model(
    'F018Canonical' + copy,
    new mongoose.Schema(
      {
        participantId: String,
        participantRole: String,
        participantType: String,
        participantName: tracked('name'),
        person: {
          sex: tracked('sex'),
          standardGivenName: tracked('given', (v) => v.toUpperCase()),
          standardFamilyName: tracked('family'),
        },
      },
      { _id: false },
    ),
  );
  for (const queue of [true, false]) {
    const participant = Player.hydrate({
      ...individual,
      participantId: 'P',
      person: { sex: 'F', standardGivenName: ' Alice ', standardFamilyName: ' Li ' },
    });
    engine.setState({ tournamentId }, copy);
    assigned.length = 0;
    const params = { participant, returnParticipant: true };
    let material;
    const notices = captureNotices(() => {
      const result = queue ? engine.executionQueue([{ method, params }], false) : engine.addParticipant(params);
      expect(result.success).toBe(true);
      material = (queue ? result.results[0] : result).participant;
    });
    expect(assigned).toEqual(['sex', 'given', 'family', 'name']);
    expect(participant.participantName).toBe('ALICE Li');
    expect(material._doc).toEqual(participant.toObject());
    if (!copy) expect(material).toBe(participant);
    expect(notices.map((n) => n.topic)).toEqual([ADD_PARTICIPANTS, MUTATIONS]);
    expect(
      notices[0].payload.participants[0].participantName ?? notices[0].payload.participants[0]._doc.participantName,
    ).toBe('ALICE Li');

    const invalid = Player.hydrate({ ...individual, person: { sex: 'F', standardGivenName: ' Alice ' } });
    const original = JSON.stringify(record());
    assigned.length = 0;
    expect(
      captureNotices(() => {
        const params = { participant: invalid };
        const result = queue ? engine.executionQueue([{ method, params }], false) : engine.addParticipant(params);
        expect(result.error.code).toBe('ERR_MISSING_PERSON_DETAILS');
      }),
    ).toEqual([]);
    expect(invalid.modifiedPaths()).toEqual([]);
    expect(assigned).toEqual([]);
    expect(JSON.stringify(record())).toBe(original);
  }
});

it.each([false, true])('returns the installed canonical values in the submitted shape, queue=%s', (queue) => {
  const field = { type: String, set: (v: string) => v.toUpperCase() };
  const row = new mongoose.Schema({
    participantId: field,
    participantName: field,
    participantType: String,
    participantRole: String,
  });
  const Roster =
    mongoose.models.F018CastRoster ??
    mongoose.model('F018CastRoster', new mongoose.Schema({ tournamentId: String, participants: [row] }));
  const doc = Roster.hydrate({ tournamentId, participants: [] });
  const list = doc.participants;
  engine.setState(doc, false);
  const input = { ...individual, participantId: 'p', participantName: 'Alice Li' };
  const canonical = { ...input, participantId: 'P', participantName: 'ALICE LI' };
  const params = { participant: input, returnParticipant: true };
  const notices = captureNotices(() => {
    const result = queue ? engine.executionQueue([{ method, params }], false) : engine.addParticipant(params);
    expect((queue ? result.results[0] : result).participant).toEqual(canonical);
  });
  expect(doc.participants).toBe(list);
  expect(list[0].toObject()).toEqual({ ...canonical, _id: expect.anything() });
  expect(doc.$getChanges()).toEqual({
    $push: { participants: { $each: [list[0].toObject()] } },
    $inc: { __v: 1 },
  });
  expect(notices.map((n) => n.topic)).toEqual([ADD_PARTICIPANTS, MUTATIONS]);
  expect(notices[0].payload.participants[0]).toBe(input);
  expect(input.participantId).toBe('p');
  expect(input.participantName).toBe('Alice Li');
});

it('requires the append when a borrowed setter declines list initialization', () => {
  const tournamentRecord = Object.defineProperty({ tournamentId }, 'participants', {
    get: () => undefined,
    set() {
      // The borrowed record declines to install the list.
    },
  });
  const participant = { ...individual, participantId: 'P', participantName: 'Player' };
  expect(
    captureNotices(() => {
      expect(() => addParticipant({ tournamentRecord, participant })).toThrow(TypeError);
    }),
  ).toEqual([]);
});

it('retains the submitted model shape when the destination recasts a hydrated input', () => {
  const fields = { participantId: String, participantName: String, participantType: String, participantRole: String };
  const Input = mongoose.model('F018SubmittedModel', new mongoose.Schema(fields, { _id: false }));
  const row = new mongoose.Schema({ ...fields, participantName: { type: String, uppercase: true } });
  const Roster = mongoose.model('F018CastedModel', new mongoose.Schema({ tournamentId: String, participants: [row] }));
  for (const queue of [false, true]) {
    const doc = Roster.hydrate({ tournamentId, participants: [] });
    const participant = Input.hydrate({ ...individual, participantId: 'p', participantName: 'Alice Li' });
    const params = { participant, returnParticipant: true };
    engine.setState(doc, false);
    const notices = captureNotices(() => {
      const result = queue ? engine.executionQueue([{ method, params }], false) : engine.addParticipant(params);
      const material = (queue ? result.results[0] : result).participant;
      expect(material).toBeInstanceOf(Input);
      expect(material.toObject()).toEqual({ ...participant.toObject(), participantName: 'ALICE LI' });
    });
    expect(doc.participants[0].participantName).toBe('ALICE LI');
    expect(notices[0].payload.participants[0]).toBe(participant);
    expect(participant.participantName).toBe('Alice Li');
  }
});
