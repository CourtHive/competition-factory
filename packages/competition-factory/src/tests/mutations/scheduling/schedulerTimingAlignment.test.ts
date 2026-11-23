import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { generateBookings } from '@Query/scheduling/generateBookings';
import { timeStringMinutes } from '@Tools/dateTime';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';

/**
 * CAPABILITY-001 (2026-11-13 ecosystem review): what a matchUp is shown to take must be what the scheduler books.
 *
 * - A draw's own scheduling policy (draw > event > tournament) was read by hydration but not by the schedulers.
 * - A line of a TEAM event was booked under the TEAM key. A team matchUp holds no court of its own, and a line is
 *   timed by its own type, SINGLES or DOUBLES, never by a TEAM figure (CA 2026-11-20).
 */

const DATE = '2026-03-02';

function scheduledRound(matchUps: any[]) {
  return matchUps
    .filter((matchUp) => matchUp.schedule?.scheduledTime)
    .sort((a, b) => timeStringMinutes(a.schedule.scheduledTime) - timeStringMinutes(b.schedule.scheduledTime));
}

describe('a draw-level scheduling policy is what the scheduler books', () => {
  const FORMAT = 'SET3-S:6/TB7';

  function scheduleFirstRound({ drawPolicy, tournamentPolicy = POLICY_SCHEDULING_DEFAULT }: any = {}) {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'v1', courtsCount: 1, startTime: '08:00', endTime: '23:00' }],
      drawProfiles: [{ drawSize: 8, matchUpFormat: FORMAT, uniqueParticipants: true }],
      policyDefinitions: tournamentPolicy,
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });
    if (drawPolicy)
      expect(tournamentEngine.attachPolicies({ drawId, policyDefinitions: drawPolicy }).success).toBe(true);

    const event = tournamentRecord.events?.find((event) => event.eventId === eventId);
    const structureId = event?.drawDefinitions?.[0].structures?.[0].structureId;
    tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId: tournamentRecord.tournamentId, eventId, drawId, structureId, roundNumber: 1 },
      scheduleDate: DATE,
      venueId: 'v1',
    });
    expect(tournamentEngine.scheduleProfileRounds({}).success).toBe(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { roundNumbers: [1] },
      afterRecoveryTimes: true,
      inContext: true,
    });
    return scheduledRound(matchUps);
  }

  it('spaces the round by the tournament policy when the draw has none', () => {
    const round = scheduleFirstRound();
    expect(round.map((matchUp) => matchUp.schedule.scheduledTime)).toEqual(['08:00', '09:30', '11:00', '12:30']);
    expect(round.map((matchUp) => matchUp.schedule.averageMinutes)).toEqual([90, 90, 90, 90]);
  });

  it("schedules the round by the draw's own policy, exactly as that policy does when the tournament carries it", () => {
    const thirty = {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: { averageTimes: [{ minutes: { default: 30 } }], recoveryTimes: [{ minutes: { default: 0 } }] },
      },
    };
    const drawScoped = scheduleFirstRound({ drawPolicy: thirty });
    const tournamentScoped = scheduleFirstRound({ tournamentPolicy: thirty });

    expect(drawScoped.map((matchUp) => matchUp.schedule.averageMinutes)).toEqual([30, 30, 30, 30]);
    expect(drawScoped.map((matchUp) => matchUp.schedule.scheduledTime)).toEqual(
      tournamentScoped.map((matchUp) => matchUp.schedule.scheduledTime),
    );
    // not the tournament policy's 90-minute spacing the draw's matchUps were scheduled with before
    expect(drawScoped.at(-1)?.schedule.scheduledTime).not.toEqual('12:30');
  });
});

describe('a line of a TEAM event is timed and booked by its own type', () => {
  const policy = {
    defaultTimes: {
      averageTimes: [{ minutes: { SINGLES: 30, TEAM: 60, default: 90 } }],
      recoveryTimes: [{ minutes: { default: 0 } }],
    },
  };
  const FORMAT = 'SET1-S:6/TB7';
  const tournamentRecord: any = { tournamentId: 't', startDate: DATE, endDate: DATE, events: [] };
  const event: any = { eventId: 'e', eventType: 'TEAM' };

  const booked = (matchUpType: string) =>
    generateBookings({
      eventTimings: { e: { eventType: 'TEAM', scheduleTiming: { policy } as any } },
      periodLength: 30,
      matchUps: [
        {
          schedule: { scheduledDate: DATE, scheduledTime: '08:00', courtId: 'c', venueId: 'v' },
          matchUpStatus: 'TO_BE_PLAYED',
          matchUpFormat: FORMAT,
          matchUpId: 'm',
          eventId: 'e',
          matchUpType,
        } as any,
      ],
    }).bookings?.[0];

  it('reads and books a SINGLES line for the SINGLES minutes', () => {
    const timing: any = getMatchUpFormatTiming({
      policyDefinitions: { scheduling: policy } as any,
      matchUpFormat: FORMAT,
      eventType: 'SINGLES',
      tournamentRecord,
      event,
    });
    expect(timing.averageMinutes).toEqual(30);
    expect(booked('SINGLES')).toMatchObject({ averageMinutes: 30, endTime: '08:30' });
  });

  it('never times a line by a TEAM figure: a DOUBLES line with no DOUBLES minutes takes the default', () => {
    const timing: any = getMatchUpFormatTiming({
      policyDefinitions: { scheduling: policy } as any,
      matchUpFormat: FORMAT,
      eventType: 'DOUBLES',
      tournamentRecord,
      event,
    });
    expect(timing.averageMinutes).toEqual(90);
    expect(booked('DOUBLES')).toMatchObject({ averageMinutes: 90, endTime: '09:30' });
  });

  it('schedules a TEAM draw by its lines, each spaced by its own minutes', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      policyDefinitions: {
        [POLICY_TYPE_SCHEDULING]: {
          defaultTimes: {
            averageTimes: [{ minutes: { SINGLES: 30, DOUBLES: 45, default: 90 } }],
            recoveryTimes: [{ minutes: { default: 0 } }],
          },
        },
      },
      venueProfiles: [{ venueId: 'v1', courtsCount: 2, startTime: '08:00', endTime: '23:00' }],
      drawProfiles: [{ drawSize: 4, eventType: 'TEAM', tieFormatName: 'COLLEGE_D3' as any }],
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });
    const event = tournamentRecord.events?.find((event) => event.eventId === eventId);
    tournamentEngine.addSchedulingProfileRound({
      round: {
        structureId: event?.drawDefinitions?.[0].structures?.[0].structureId,
        tournamentId: tournamentRecord.tournamentId,
        roundNumber: 1,
        eventId,
        drawId,
      },
      scheduleDate: DATE,
      venueId: 'v1',
    });
    expect(tournamentEngine.scheduleProfileRounds({}).success).toBe(true);

    const scheduled = scheduledRound(
      tournamentEngine.allTournamentMatchUps({ inContext: true, afterRecoveryTimes: true }).matchUps ?? [],
    );
    // only lines hold courts; the team matchUp itself is never booked
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every((matchUp) => matchUp.collectionId)).toBe(true);
    for (const matchUp of scheduled) {
      expect(matchUp.schedule.averageMinutes).toEqual(matchUp.matchUpType === 'DOUBLES' ? 45 : 30);
    }
    // spaced by those minutes rather than the 90-minute default the TEAM key fell back to: 18 lines on two courts
    // ran to 20:30 that way, and end by 14:30 timed as the SINGLES and DOUBLES they are
    const lastStart = scheduled.at(-1)?.schedule.scheduledTime;
    expect(timeStringMinutes(lastStart)).toBeLessThanOrEqual(timeStringMinutes('14:30'));
  });
});

describe("a TEAM event's own format timing override", () => {
  function teamEvent() {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO' as any }],
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });
    const { event } = tournamentEngine.getEvent({ eventId });
    const tieFormat = event.tieFormat ?? event.drawDefinitions[0].tieFormat;
    const singlesFormat = tieFormat.collectionDefinitions.find((c: any) => c.matchUpType === 'SINGLES').matchUpFormat;
    return { eventId, singlesFormat };
  }
  const storedOverrides = (eventId: string) =>
    JSON.stringify(tournamentEngine.getEvent({ eventId }).event.extensions ?? []);

  it("is stored as the event's default for the format, never as a TEAM figure, and times the line", () => {
    const { eventId, singlesFormat } = teamEvent();
    expect(
      tournamentEngine.modifyEventMatchUpFormatTiming({ matchUpFormat: singlesFormat, averageMinutes: 75, eventId })
        .success,
    ).toBe(true);
    expect(storedOverrides(eventId)).not.toContain('"TEAM"');
    const timing = tournamentEngine.getMatchUpFormatTiming({
      matchUpFormat: singlesFormat,
      eventType: 'SINGLES',
      eventId,
    });
    expect(timing.averageMinutes).toEqual(75);
  });

  it('still applies an override stored under TEAM before this change', () => {
    const { eventId, singlesFormat } = teamEvent();
    tournamentEngine.modifyEventMatchUpFormatTiming({ matchUpFormat: singlesFormat, averageMinutes: 75, eventId });
    // rewrite the stored override as the old writer keyed it
    const { tournamentRecord } = tournamentEngine.getTournament();
    const event = tournamentRecord.events.find((event: any) => event.eventId === eventId);
    const legacy = JSON.parse(JSON.stringify(event.extensions).replaceAll('"default":75', '"TEAM":75'));
    event.extensions = legacy;
    tournamentEngine.setState(tournamentRecord);
    expect(storedOverrides(eventId)).toContain('"TEAM":75');

    const timing = tournamentEngine.getMatchUpFormatTiming({
      matchUpFormat: singlesFormat,
      eventType: 'SINGLES',
      eventId,
    });
    expect(timing.averageMinutes).toEqual(75);
  });
});
