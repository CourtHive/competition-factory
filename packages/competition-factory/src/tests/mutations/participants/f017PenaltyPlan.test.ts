import { captureNotices } from '../notifications/noticeConformance/harness';
import { MODIFY_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { PENALTY_NOT_FOUND } from '@Constants/errorConditionConstants';
import { modifyPenalty } from '@Mutate/participants/penalties/modifyPenalty';
import { UUID } from '@Tools/UUID';
import { setRandomSource } from '@Tools/prng';
import engine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

const method = 'modifyPenalty';
const params = { penaltyId: 'P', modifications: { penaltyType: 'Ball Abuse', notes: 'edited', penaltyId: 'ignored' } };
function records() {
  const penalty = (penaltyCode: string) => ({ penaltyId: 'P', penaltyType: 'OTHER', penaltyCode });
  return [
    { tournamentId: 'A', participants: [{ participantId: 'a' }] },
    {
      tournamentId: 'B',
      participants: [
        { participantId: 'b0' },
        { participantId: 'b1', penalties: [penalty('first'), penalty('second')] },
        { participantId: 'b2', penalties: [penalty('third')] },
      ],
    },
    { tournamentId: 'C', participants: [{ participantId: 'c', penalties: [penalty('fourth')] }] },
  ];
}

afterEach(() => {
  setRandomSource();
  engine.setState({ tournamentId: 'reset' });
});

it.each([true, false])('refuses an unknown penalty across all records, deepCopy=%s', (deepCopy) => {
  engine.setState(records(), deepCopy);
  const missing = { ...params, penaltyId: 'absent' };
  const before = JSON.stringify(engine.getState());
  const notices = captureNotices(() => {
    expect(engine.modifyPenalty(missing).error).toEqual(PENALTY_NOT_FOUND);
    expect(JSON.stringify(engine.getState())).toBe(before);
    expect(engine.executionQueue([{ method, params: missing }], false).error?.code).toBe(PENALTY_NOT_FOUND.code);
    expect(JSON.stringify(engine.getState())).toBe(before);
  });
  expect(notices).toEqual([]);
});

it.each([true, false])('preserves the successful multi-record edit, deepCopy=%s', (deepCopy) => {
  const source = records();
  engine.setState(source, deepCopy);
  const notices = captureNotices(() => {
    expect(engine.modifyPenalty(params)).toEqual({
      success: true,
      penalty: {
        penaltyId: 'P',
        penaltyType: 'BALL_ABUSE',
        penaltyCode: 'first',
        notes: 'edited',
      },
    });
  });
  const { A, B, C } = engine.getState().tournamentRecords;
  expect(A.participants).toEqual([{ participantId: 'a', penalties: [] }]);
  const edited = (penaltyCode: string) => ({ penaltyCode, penaltyId: 'P', penaltyType: 'BALL_ABUSE', notes: 'edited' });
  expect(B.participants).toEqual([
    { participantId: 'b0', penalties: [] },
    { participantId: 'b1', penalties: [edited('first'), edited('second')] },
    { participantId: 'b2', penalties: [edited('third')] },
  ]);
  expect(C.participants).toEqual([
    { participantId: 'c', penalties: [{ penaltyId: 'P', penaltyCode: 'fourth', penaltyType: 'OTHER' }] },
  ]);
  expect(notices.map(({ topic }) => topic)).toEqual([MODIFY_PARTICIPANTS, MUTATIONS]);
  expect(notices[0].payload).toEqual({ tournamentId: 'B', participants: B.participants.slice(1) });
  expect(notices[1].payload).toEqual({
    tournamentId: undefined,
    directives: [{ method: modifyPenalty, params: { ...params, activeTournamentId: undefined } }],
    timeStamp: B.factory.timeStamp,
  });
});

it.each([
  ['P', 2],
  ['absent', 3],
] as const)('consumes a template UUID for each record visited by %s', (penaltyId, visited) => {
  setRandomSource(17);
  for (let index = 0; index < visited; index++) UUID();
  const expected = UUID();
  setRandomSource(17);
  const tournamentRecords = Object.fromEntries(records().map((record) => [record.tournamentId, record]));
  modifyPenalty({ ...params, penaltyId, tournamentRecords });
  expect(UUID()).toBe(expected);
});
