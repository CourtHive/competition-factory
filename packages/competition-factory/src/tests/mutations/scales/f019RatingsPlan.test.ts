import { captureNotices } from '../notifications/noticeConformance/harness';
import { INVALID_SCALE_ITEM, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_PARTICIPANTS, MUTATIONS } from '@Constants/topicConstants';
import { generateDynamicRatings } from '@Mutate/participants/scaleItems/generateDynamicRatings';
import { setClock } from '@Tools/clock';
import engine from '@Engines/scaleEngine';
import { afterEach, expect, it } from 'vitest';

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
