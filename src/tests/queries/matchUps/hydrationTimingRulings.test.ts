import { addMinutesToTimeString } from '@Tools/dateTime';
import { addDaysToDate } from '@Tools/civilDateTime';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';

/**
 * The timing hydration reports, as CA ruled it on 2026-10-26 (Mentat planning/HYDRATION_DERIVATIONS_SCHEDULING_FIELDS.md
 * § 9, OPEN-7, 8, 9, 11). The default policy times a best-of-three standard format at 90 minutes and recovers 60.
 */
const FORMAT = 'SET3-S:6/TB7';

function singleDraw(policyDefinitions: any = POLICY_SCHEDULING_DEFAULT) {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, matchUpFormat: FORMAT }],
    policyDefinitions,
    setState: true,
  });
  const firstRound = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
    .matchUps.sort((a: any, b: any) => a.roundPosition - b.roundPosition);
  return { drawId, startDate: tournamentRecord.startDate, firstRound };
}

const schedule = (matchUp: any, items: Record<string, string>) => {
  const result = tournamentEngine.addMatchUpScheduleItems({
    schedule: items,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  expect(result.success).toEqual(true);
};

const hydrated = (matchUpId: string) =>
  tournamentEngine
    .allTournamentMatchUps({ afterRecoveryTimes: true, nextMatchUps: true, inContext: true })
    .matchUps.find((m: any) => m.matchUpId === matchUpId);

describe('a wall-clock addition is arithmetic, not a Date (OPEN-7)', () => {
  it.each([
    ['10:00', 90, '11:30'],
    ['23:30', 60, '00:30'],
    ['00:15', -30, '23:45'],
    ['22:00', 1500, '23:00'],
    ['09:00', 30.9, '09:30'],
    ['not a time', 30, '00:00'],
  ])('%s + %s = %s', (time, minutes, expected) => {
    expect(addMinutesToTimeString(time, minutes)).toEqual(expected);
  });
});

describe('a recovery carries its date across midnight (OPEN-8)', () => {
  it('within the day: the date of play', () => {
    const { firstRound, startDate } = singleDraw();
    schedule(firstRound[0], { scheduledDate: startDate, scheduledTime: '10:00' });
    const { schedule: hydratedSchedule } = hydrated(firstRound[0].matchUpId);
    expect([hydratedSchedule.timeAfterRecovery, hydratedSchedule.dateAfterRecovery]).toEqual(['12:30', startDate]);
  });

  it('past midnight: the next day', () => {
    const { firstRound, startDate } = singleDraw();
    schedule(firstRound[0], { scheduledDate: startDate, scheduledTime: '22:30' });
    const { schedule: hydratedSchedule } = hydrated(firstRound[0].matchUpId);
    // 22:30 + 90 + 60 = 01:00 the next day
    expect([hydratedSchedule.timeAfterRecovery, hydratedSchedule.dateAfterRecovery]).toEqual([
      '01:00',
      addDaysToDate(startDate, 1),
    ]);
  });

  it('a recorded end of play earlier than the start was after midnight', () => {
    const { firstRound, startDate } = singleDraw();
    schedule(firstRound[0], { scheduledDate: startDate, scheduledTime: '22:30', endTime: '00:30' });
    const { schedule: hydratedSchedule } = hydrated(firstRound[0].matchUpId);
    // 00:30 the next day + 60
    expect([hydratedSchedule.timeAfterRecovery, hydratedSchedule.dateAfterRecovery]).toEqual([
      '01:30',
      addDaysToDate(startDate, 1),
    ]);
  });

  it('a conflict compares the date too: later the same night is before a recovery ending at 01:00', () => {
    const { firstRound, startDate } = singleDraw();
    const next = (firstRoundMatchUp: any) => hydrated(firstRoundMatchUp.matchUpId).winnerTo;
    schedule(firstRound[0], { scheduledDate: startDate, scheduledTime: '22:30' });
    const { matchUp: targetMatchUp } = tournamentEngine.findMatchUp({ matchUpId: next(firstRound[0]).matchUpId });
    // 23:45 on the same night: by the clock alone it looks later than 01:00's recovery, by the date it is before it
    schedule(targetMatchUp, { scheduledDate: startDate, scheduledTime: '23:45' });
    expect(next(firstRound[0]).schedule.scheduleConflict).toEqual(firstRound[0].matchUpId);
    // the next morning is after it
    schedule(targetMatchUp, { scheduledDate: addDaysToDate(startDate, 1) as string, scheduledTime: '09:00' });
    expect(next(firstRound[0]).schedule.scheduleConflict).toBeUndefined();
  });
});

describe('endTime reads as every schedule attribute does (OPEN-9)', () => {
  it('a first-class schedule.endTime is read', () => {
    const { firstRound, startDate, drawId } = singleDraw();
    schedule(firstRound[0], { scheduledDate: startDate, scheduledTime: '10:00' });
    const record = tournamentEngine.getTournament().tournamentRecord;
    const stored = record.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (m: any) => m.matchUpId === firstRound[0].matchUpId,
    );
    stored.schedule = { ...stored.schedule, endTime: '11:15' };
    tournamentEngine.setState(record);
    expect(hydrated(firstRound[0].matchUpId).schedule.endTime).toEqual('11:15');
    expect(drawId).toBeDefined();
  });

  it('of two END_TIME items stamped alike, the last', () => {
    const { firstRound } = singleDraw();
    const record = tournamentEngine.getTournament().tournamentRecord;
    const stored = record.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (m: any) => m.matchUpId === firstRound[0].matchUpId,
    );
    const createdAt = '2026-10-26T10:00:00.000Z';
    stored.timeItems = [
      { itemType: 'SCHEDULE.TIME.END', itemValue: '11:00', createdAt },
      { itemType: 'SCHEDULE.TIME.END', itemValue: '11:20', createdAt },
    ];
    tournamentEngine.setState(record);
    expect(hydrated(firstRound[0].matchUpId).schedule.endTime).toEqual('11:20');
  });
});

describe('a draw’s scheduling policy times its matchUps (OPEN-11)', () => {
  it('a draw recovering 30 minutes, under a tournament policy that recovers 60', () => {
    const { firstRound, startDate, drawId } = singleDraw();
    const drawPolicy = {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 30 } }],
        },
      },
    };
    expect(tournamentEngine.attachPolicies({ drawId, policyDefinitions: drawPolicy }).success).toEqual(true);
    schedule(firstRound[0], { scheduledDate: startDate, scheduledTime: '10:00' });
    // 10:00 + 90 + 30
    expect(hydrated(firstRound[0].matchUpId).schedule.timeAfterRecovery).toEqual('12:00');
  });
});
