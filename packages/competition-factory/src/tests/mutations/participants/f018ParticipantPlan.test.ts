import { addParticipant, planAddParticipant } from '@Mutate/participants/addParticipant';
import { captureNotices } from '../notifications/noticeConformance/harness';
import { indexParticipants } from '@Mutate/participants/participantsIndex';
import { ADD_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { afterEach, expect, it } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

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
