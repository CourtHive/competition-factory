import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractTime } from '@Tools/dateTime';
import { describe, expect, it } from 'vitest';

// constants
import { EXISTING_ROUND } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { AUTO_SCHEDULING_AUDIT } from '@Constants/auditConstants';
import { SCHEDULED_DATE } from '@Constants/timeItemConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

const DATE = '2026-03-02';

// fixed timing so slot arithmetic is predictable: every matchUp averages `minutes`, no recovery
const fixedTiming = (minutes = 90) => ({
  [POLICY_TYPE_SCHEDULING]: {
    defaultTimes: {
      averageTimes: [{ minutes: { default: minutes } }],
      recoveryTimes: [{ minutes: { default: 0 } }],
    },
  },
});

const scheduledTimeOf = (matchUp: any) => matchUp.schedule?.scheduledTime;

const drawRounds = (drawId: string) =>
  (tournamentEngine.getRounds().rounds ?? []).filter((round: any) => round.drawId === drawId);

describe('jinn profile scheduling mechanics', () => {
  // S1: noTimeMatchUpIds[date] was overwritten by each venue in turn, so an earlier venue's
  // unscheduled matchUps vanished from the result when a later venue placed everything.
  it('S1: noTimeMatchUpIds reports the unscheduled matchUps of every venue on a date', () => {
    const { tournamentRecord, drawIds, venueIds } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        { courtsCount: 1, startTime: '08:00', endTime: '10:00' },
        { courtsCount: 6, startTime: '08:00', endTime: '20:00' },
      ],
      drawProfiles: [{ drawSize: 8 }, { drawSize: 4 }],
      policyDefinitions: fixedTiming(),
      startDate: DATE,
      endDate: DATE,
    });
    tournamentEngine.setState(tournamentRecord);

    const [tightRound] = drawRounds(drawIds[0]);
    const [roomyRound] = drawRounds(drawIds[1]);
    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: DATE,
          venues: [
            { venueId: venueIds[0], rounds: [tightRound] },
            { venueId: venueIds[1], rounds: [roomyRound] },
          ],
        },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.scheduleProfileRounds();
    expect(result.success).toEqual(true);

    const unscheduledTightIds = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m: any) => m.drawId === drawIds[0] && m.roundNumber === 1 && !scheduledTimeOf(m))
      .map((m: any) => m.matchUpId)
      .sort((a: string, b: string) => a.localeCompare(b));

    // non-vacuity: one court for two hours cannot hold four 90 minute matchUps
    expect(unscheduledTightIds.length).toEqual(3);
    expect([...result.noTimeMatchUpIds[DATE]].sort((a: string, b: string) => a.localeCompare(b))).toEqual(
      unscheduledTightIds,
    );
  });

  // S2: a constant failSafe of 10 passes capped a day: with one court each pass places at most two
  // matchUps, so a long day stopped at 20 and reported the rest as having no time.
  it('S2: a single court with a long day schedules a whole round of 32 matchUps', () => {
    const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, startTime: '06:00', endTime: '23:30' }],
      drawProfiles: [{ drawSize: 64 }],
      policyDefinitions: fixedTiming(30),
      startDate: DATE,
      endDate: DATE,
    });
    tournamentEngine.setState(tournamentRecord);

    const [round] = tournamentEngine.getRounds().rounds;
    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: DATE, venues: [{ venueId: venueIds[0], rounds: [round] }] }],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.scheduleProfileRounds({ periodLength: 30 });
    expect(result.success).toEqual(true);

    const times = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m: any) => m.roundNumber === 1)
      .map(scheduledTimeOf)
      .filter(Boolean);

    // 32 matchUps of 30 minutes on one court across 17.5 hours: all fit, one at a time
    expect({
      scheduled: times.length,
      distinctTimes: new Set(times).size,
      noTime: result.noTimeMatchUpIds[DATE],
    }).toEqual({ scheduled: 32, distinctTimes: 32, noTime: [] });
  });

  // S3: jinn generated its Garman schedule times from every court at the venue, ignoring courtIds,
  // so a one-court selection still started four matchUps at once.
  it('S3: courtIds narrows how many matchUps share a start time', () => {
    const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawSize: 16 }],
      policyDefinitions: fixedTiming(),
      startDate: DATE,
      endDate: DATE,
    });
    tournamentEngine.setState(tournamentRecord);

    const [round] = tournamentEngine.getRounds().rounds;
    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: DATE, venues: [{ venueId: venueIds[0], rounds: [round] }] }],
    });
    expect(result.success).toEqual(true);

    const courtIds = [tournamentEngine.getVenuesAndCourts().courts[0].courtId];
    result = tournamentEngine.scheduleProfileRounds({ courtIds });
    expect(result.success).toEqual(true);

    const times = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m: any) => m.roundNumber === 1)
      .map(scheduledTimeOf)
      .filter(Boolean);

    // one court from 08:00 to 20:00 holds all 8 matchUps of 90 minutes, one every 90 minutes (the last at 18:30, ending at
    // 20:00), never two at once
    expect({
      noTime: result.noTimeMatchUpIds[DATE].length,
      distinctTimes: new Set(times).size,
      scheduled: times.length,
    }).toEqual({ scheduled: 8, distinctTimes: 8, noTime: 0 });
  });

  // S4: one round was accepted at two venues on one date, raised no profile issue, and was
  // scheduled once per venue.
  describe('S4: a round profiled at two venues on one date', () => {
    const setup = () => {
      const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
        venueProfiles: [
          { courtsCount: 2, startTime: '08:00', endTime: '20:00' },
          { courtsCount: 2, startTime: '08:00', endTime: '20:00' },
        ],
        drawProfiles: [{ drawSize: 16 }],
        policyDefinitions: fixedTiming(),
        startDate: DATE,
        endDate: DATE,
      });
      tournamentEngine.setState(tournamentRecord);
      const [round] = tournamentEngine.getRounds().rounds;
      return { round, venueIds };
    };

    it('addSchedulingProfileRound refuses the round at a second venue', () => {
      const { round, venueIds } = setup();
      let result: any = tournamentEngine.addSchedulingProfileRound({ scheduleDate: DATE, venueId: venueIds[0], round });
      expect(result.success).toEqual(true);
      result = tournamentEngine.addSchedulingProfileRound({ scheduleDate: DATE, venueId: venueIds[1], round });
      expect(result.error).toEqual(EXISTING_ROUND);

      const { schedulingProfile } = tournamentEngine.getSchedulingProfile();
      expect(schedulingProfile[0].venues.map((venue: any) => venue.venueId)).toEqual([venueIds[0]]);
    });

    it('getSchedulingProfile reports a stored profile that holds it, and each matchUp is scheduled once', () => {
      const { round, venueIds } = setup();
      let result: any = tournamentEngine.setSchedulingProfile({
        schedulingProfile: [
          {
            scheduleDate: DATE,
            venues: venueIds.map((venueId: string) => ({ venueId, rounds: [round] })),
          },
        ],
      });
      expect(result.success).toEqual(true);

      const { issues } = tournamentEngine.getSchedulingProfile();
      expect(issues?.length).toEqual(1);

      result = tournamentEngine.scheduleProfileRounds();
      expect(result.success).toEqual(true);
      expect(result.schedulingProfileIssues).toEqual(issues);

      const scheduledIds = result.scheduledMatchUpIds[DATE];
      expect({ scheduled: scheduledIds.length, distinct: new Set(scheduledIds).size }).toEqual({
        scheduled: 8,
        distinct: 8,
      });
    });
  });

  // S5: jinn carried a clearByeMatchUpScheduling step that could never run (it always received
  // the date's scheduled matchUpIds, which suppress BYE collection). Making it reachable would
  // erase BYE placements, against the byeSchedulingPreservation policy, so it was removed; this
  // pins that a profile run leaves a scheduled BYE exactly where the operator put it.
  it('S5: a profile run keeps the schedule of a BYE matchUp', () => {
    const {
      drawIds: [drawId],
      venueIds,
    } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
      policyDefinitions: fixedTiming(),
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });

    const byeMatchUp = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
      .matchUps.find((m: any) => m.matchUpStatus === BYE);
    const court = tournamentEngine.getVenuesAndCourts().courts[0];
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: {
        venueId: court.venueId,
        courtId: court.courtId,
        scheduledTime: '08:00',
        scheduledDate: DATE,
        courtOrder: 1,
      },
      matchUpId: byeMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const [round] = tournamentEngine.getRounds().rounds;
    result = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: DATE, venues: [{ venueId: venueIds[0], rounds: [round] }] }],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.scheduleProfileRounds();
    expect(result.success).toEqual(true);
    // non-vacuity: the run placed the playable matchUps of the round
    expect(result.scheduledMatchUpIds[DATE].length).toEqual(2);

    const { schedule } = tournamentEngine.findMatchUp({ matchUpId: byeMatchUp.matchUpId, drawId }).matchUp;
    expect(schedule).toMatchObject({
      scheduledDate: DATE,
      scheduledTime: '08:00',
      courtId: court.courtId,
      courtOrder: 1,
    });
  });

  // S6: bookings and already-scheduled matchUps were found by exact string comparison with the
  // scheduleDate, so a stored scheduledDate carrying a time component was invisible: the matchUp
  // was rescheduled and its court time given to another.
  // the date compare is shared: generateBookings serves jinn, processAlreadyScheduledMatchUps serves v2 (pro)
  it.each([false, true])('S6: a stored scheduledDate carrying a time still holds its matchUp (pro: %s)', (pro) => {
    const { venueIds } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawSize: 4 }],
      policyDefinitions: fixedTiming(),
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });

    const target = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps[1];
    const court = tournamentEngine.getVenuesAndCourts().courts[0];
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { venueId: court.venueId, courtId: court.courtId, scheduledTime: '08:00', scheduledDate: DATE },
      matchUpId: target.matchUpId,
      drawId: target.drawId,
    });
    expect(result.success).toEqual(true);

    // an imported record may store the date with a time component; writers normalize, so write it directly
    const dateWithTime = `${DATE}T08:00`;
    const { tournamentRecord } = tournamentEngine.getTournament();
    const storedMatchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (m: any) => m.matchUpId === target.matchUpId,
    );
    if (storedMatchUp.schedule?.scheduledDate) storedMatchUp.schedule.scheduledDate = dateWithTime;
    for (const timeItem of storedMatchUp.timeItems ?? []) {
      if (timeItem.itemType === SCHEDULED_DATE) timeItem.itemValue = dateWithTime;
    }
    tournamentEngine.setState(tournamentRecord);
    const { schedule } = tournamentEngine.findMatchUp({ matchUpId: target.matchUpId, drawId: target.drawId }).matchUp;
    // non-vacuity: the stored date really carries the time
    expect(schedule.scheduledDate).toEqual(dateWithTime);

    const [round] = tournamentEngine.getRounds().rounds;
    result = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: DATE, venues: [{ venueId: venueIds[0], rounds: [round] }] }],
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.scheduleProfileRounds({ pro });
    expect(result.success).toEqual(true);

    // v2 stores scheduledTime with the date prefixed; compare the time of day
    const times = Object.fromEntries(
      tournamentEngine
        .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
        .matchUps.map((m: any) => [
          m.matchUpId === target.matchUpId ? 'target' : 'other',
          extractTime(scheduledTimeOf(m)),
        ]),
    );
    // the target keeps 08:00 on the only court; the other matchUp follows it
    expect(times).toEqual({ target: '08:00', other: '09:30' });
  });

  // S7: getCount read `count + value.length || 0`, so any per-date value without a length reset
  // the running count to zero instead of adding nothing.
  it('S7: the auto-scheduling audit counts survive a per-date value without a length', () => {
    const tournamentRecord: any = { tournamentId: 'audit-tournament' };
    auditAutoScheduling({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
      autoSchedulingAudit: {
        scheduledMatchUpIds: { [DATE]: ['m1', 'm2', 'm3'], '2026-03-03': {} },
        noTimeMatchUpIds: { [DATE]: ['m4'], '2026-03-03': undefined },
        scheduledDates: [DATE, '2026-03-03'],
      },
    });

    const auditItem = tournamentRecord.timeItems.find((timeItem: any) => timeItem.itemType === AUTO_SCHEDULING_AUDIT);
    expect(auditItem.itemValue).toMatchObject({ scheduledMatchUpIdsCount: 3, noTimeMatchUpIdsCount: 1 });
  });
});
