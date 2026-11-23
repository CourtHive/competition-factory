import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { BYE, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  CHECK_IN,
  CLEAR_SCHEDULE,
  END,
  REFEREE,
  SCHEDULE,
  SCHEDULE_DATE,
  SCHEDULE_ITEMS_METHOD,
  SCHEDULE_LOCK,
  SCHEDULE_TIME,
  SCOREKEEPER,
  START,
} from '@Constants/matchUpActionConstants';

// The ⋮ popover's scheduling and staffing actions, decided by the factory (CA 2026-10-30): presence is the permission,
// each is switchable by policy, and the date and time actions carry the bounds the write accepts.

const day1 = '2026-10-01';
const day2 = '2026-10-02';
const day3 = '2026-10-03';

const SCHEDULE_FAMILY = [
  SCHEDULE_DATE,
  SCHEDULE_TIME,
  START,
  END,
  CLEAR_SCHEDULE,
  SCHEDULE_LOCK,
  CHECK_IN,
  SCOREKEEPER,
];
const PRE_PLAY = [CLEAR_SCHEDULE, SCHEDULE_LOCK, CHECK_IN, SCOREKEEPER];

const at = (roundNumber: number, roundPosition: number) =>
  tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

const actionsOf = (matchUp: any, extra: any = {}) =>
  tournamentEngine.matchUpActions({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, ...extra }).validActions;

const typesOf = (matchUp: any, extra: any = {}) =>
  actionsOf(matchUp, extra)
    .map(({ type }) => type)
    .filter((type: string) => [REFEREE, ...SCHEDULE_FAMILY].includes(type));

const actionOf = (matchUp: any, type: string) => actionsOf(matchUp).find((action: any) => action.type === type);

const write = (matchUp: any, schedule: any) =>
  tournamentEngine.addMatchUpScheduleItems({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, schedule });

const score = (matchUp: any, outcome: any) =>
  tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, outcome });

function draw(drawProfile: any = { drawSize: 8 }) {
  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], startDate: day1, endDate: day3, setState: true });
}

describe('matchUpActions: scheduling and staffing', () => {
  it('offers a matchUp still to be played everything, and each action is a call the engine accepts', () => {
    draw();
    expect(write(at(1, 1), { scheduledDate: day1, scheduledTime: '09:00', courtId: undefined }).success).toEqual(true);
    const matchUp = at(1, 1);
    expect(typesOf(matchUp)).toEqual([REFEREE, ...SCHEDULE_FAMILY]);

    // SCHEDULE named setMatchUpStatus until 2026-10-30
    expect(actionOf(matchUp, SCHEDULE).method).toEqual(SCHEDULE_ITEMS_METHOD);
    for (const action of actionsOf(matchUp)) {
      if (action.method) expect(typeof tournamentEngine[action.method]).toEqual('function');
    }

    const [participantId] = matchUp.sides.map((side: any) => side.participantId);
    const take = (type: string, fill: (payload: any) => any) => {
      const { method, payload } = actionOf(at(1, 1), type);
      return tournamentEngine[method](fill(payload));
    };

    expect(take(SCHEDULE_DATE, (p) => ({ ...p, schedule: { scheduledDate: day2 } })).success).toEqual(true);
    expect(take(SCHEDULE_TIME, (p) => ({ ...p, schedule: { scheduledTime: '10:00' } })).success).toEqual(true);
    expect(take(START, (p) => ({ ...p, schedule: { startTime: '10:05' } })).success).toEqual(true);
    expect(take(END, (p) => ({ ...p, schedule: { endTime: '11:30' } })).success).toEqual(true);
    expect(take(CHECK_IN, (p) => ({ ...p, participantId })).success).toEqual(true);
    expect(take(SCOREKEEPER, (p) => ({ ...p, participantId })).success).toEqual(true);
    expect(at(1, 1).schedule).toMatchObject({
      scheduledDate: day2,
      scheduledTime: '10:00',
      startTime: '10:05',
      endTime: '11:30',
      scorekeeper: participantId,
    });

    expect(take(CLEAR_SCHEDULE, (p) => p).success).toEqual(true);
    const { scheduledDate, scheduledTime } = at(1, 1).schedule ?? {};
    expect([scheduledDate, scheduledTime].filter(Boolean)).toEqual([]);
  });

  it('a lock removes the placement actions and the lock action unlocks', () => {
    draw();
    expect(write(at(1, 1), { scheduledDate: day1 }).success).toEqual(true);

    let lock = actionOf(at(1, 1), SCHEDULE_LOCK);
    expect(lock.scheduleLocked).toEqual(false);
    expect(
      tournamentEngine[lock.method]({ ...lock.payload, lock: { lockedAt: '2026-10-01T08:00:00Z' } }).success,
    ).toEqual(true);

    const locked = at(1, 1);
    expect(typesOf(locked)).toEqual([REFEREE, START, END, SCHEDULE_LOCK, CHECK_IN, SCOREKEEPER]);
    lock = actionOf(locked, SCHEDULE_LOCK);
    expect(lock.scheduleLocked).toEqual(true);
    expect(lock.payload.lock).toBeNull();
    expect(tournamentEngine[lock.method](lock.payload).success).toEqual(true);
    expect(typesOf(at(1, 1))).toEqual([REFEREE, ...SCHEDULE_FAMILY]);
  });

  it('nothing unplaced is cleared or locked, and nobody absent is checked in, scorekept, started or ended', () => {
    draw();
    expect(typesOf(at(1, 1))).toEqual([REFEREE, SCHEDULE_DATE, SCHEDULE_TIME, START, END, CHECK_IN, SCOREKEEPER]);
    expect(typesOf(at(2, 1))).toEqual([REFEREE, SCHEDULE_DATE, SCHEDULE_TIME]);
  });

  it('a decided matchUp keeps its date, time, official, start and end, and nothing that readies play', () => {
    draw();
    expect(write(at(1, 1), { scheduledDate: day1, scheduledTime: '09:00' }).success).toEqual(true);
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    expect(score(at(1, 1), outcome).success).toEqual(true);

    const types = typesOf(at(1, 1));
    expect(types).toEqual([REFEREE, SCHEDULE_DATE, SCHEDULE_TIME, START, END]);
    PRE_PLAY.forEach((type) => expect(types).not.toContain(type));

    // a completed matchUp's recorded times are written, not silently skipped
    const end = actionOf(at(1, 1), END);
    expect(tournamentEngine[end.method]({ ...end.payload, schedule: { endTime: '10:30' } }).success).toEqual(true);
    expect(at(1, 1).schedule.endTime).toEqual('10:30');
  });

  it('a walkover keeps its official, date and time, with no start or end', () => {
    draw();
    expect(score(at(1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }).success).toEqual(true);
    expect(typesOf(at(1, 1))).toEqual([REFEREE, SCHEDULE_DATE, SCHEDULE_TIME]);
  });

  it('a BYE and the exit a double walkover produces are offered nothing', () => {
    draw({ drawSize: 8, participantsCount: 7 });
    const bye = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpStatus === BYE);
    expect(typesOf(bye)).toEqual([]);

    draw();
    const doubleWalkover = { matchUpStatus: 'DOUBLE_WALKOVER' };
    expect(score(at(1, 1), doubleWalkover).success).toEqual(true);
    expect(score(at(1, 2), { matchUpStatus: WALKOVER, winningSide: 1 }).success).toEqual(true);
    expect(at(2, 1).matchUpStatus).toEqual(WALKOVER);
    expect(typesOf(at(2, 1))).toEqual([]);
    expect(typesOf(at(1, 1))).toEqual([REFEREE, SCHEDULE_DATE, SCHEDULE_TIME]);
  });

  it('a policy enables or disables each action', () => {
    draw();
    expect(write(at(1, 1), { scheduledDate: day1 }).success).toEqual(true);
    const policy = (structurePolicy: any) => ({
      policyDefinitions: { [POLICY_TYPE_MATCHUP_ACTIONS]: { enabledStructures: [structurePolicy] } },
    });

    let types = typesOf(at(1, 1), policy({ enabledActions: [], disabledActions: [CHECK_IN, SCHEDULE_DATE] }));
    expect(types).toEqual([REFEREE, SCHEDULE_TIME, START, END, CLEAR_SCHEDULE, SCHEDULE_LOCK, SCOREKEEPER]);

    types = typesOf(at(1, 1), policy({ enabledActions: [SCHEDULE_TIME, SCHEDULE_LOCK] }));
    expect(types).toEqual([SCHEDULE_TIME, SCHEDULE_LOCK]);
  });

  it('the date and time actions carry the bounds the write accepts', () => {
    draw();
    expect(write(at(2, 1), { scheduledDate: day2, scheduledTime: '10:00' }).success).toEqual(true);
    const quarterfinal = at(1, 1);

    const date = actionOf(quarterfinal, SCHEDULE_DATE);
    expect(date.bounds).toEqual({
      earliestDate: day1,
      latestDate: day2,
      scheduledBefore: { date: day2, time: '10:00', inclusive: false },
    });
    expect(actionOf(quarterfinal, SCHEDULE_TIME).bounds).toEqual({
      scheduledBefore: { date: day2, time: '10:00', inclusive: false },
    });
    expect(actionOf(quarterfinal, START).bounds).toEqual({});

    const fill = (scheduledDate: string) => ({ ...date.payload, schedule: { scheduledDate } });
    expect(tournamentEngine[date.method](fill(day3)).error).toEqual(ANACHRONISM);
    expect(tournamentEngine[date.method](fill(day2)).success).toEqual(true);
  });
});
