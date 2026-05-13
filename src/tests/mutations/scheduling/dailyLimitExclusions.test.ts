import { processAlreadyScheduledMatchUps } from '@Mutate/matchUps/schedule/schedulers/processAlreadyScheduledMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { BYE, COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TOTAL } from '@Constants/scheduleConstants';

// A handcrafted SINGLES matchUp with two participants.
// `sides[].participantId` is what getIndividualParticipantIds picks up,
// which is in turn what modifyParticipantMatchUpsCount increments.
function buildSinglesMatchUp({
  matchUpId,
  matchUpStatus,
  scheduledDate,
  scheduledTime,
  participantIds = ['p1', 'p2'],
  drawId = 'd1',
}: {
  matchUpId: string;
  matchUpStatus?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  participantIds?: [string, string];
  drawId?: string;
}): any {
  const schedule: any = {};
  if (scheduledDate) schedule.scheduledDate = scheduledDate;
  if (scheduledTime) schedule.scheduledTime = scheduledTime;
  return {
    matchUpId,
    matchUpStatus,
    matchUpType: SINGLES,
    tournamentId: 't1',
    drawId,
    sides: [{ participantId: participantIds[0] }, { participantId: participantIds[1] }],
    schedule,
  };
}

function getSinglesCount(profiles: any, participantId: string): number {
  return profiles[participantId]?.counters?.[SINGLES] ?? 0;
}

function getTotalCount(profiles: any, participantId: string): number {
  return profiles[participantId]?.counters?.[TOTAL] ?? 0;
}

describe('processAlreadyScheduledMatchUps — exclusion flags', () => {
  // ============================================================
  // Default-behavior tests (excludeNoDateCompleted=true, excludePriorDates=true)
  // ============================================================

  it('excludes COMPLETED matchUps with no scheduledDate by default', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'completed-no-date',
        matchUpStatus: COMPLETED,
        scheduledTime: '10:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['completed-no-date'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(0);
    expect(getSinglesCount(individualParticipantProfiles, 'p2')).toBe(0);
  });

  it('excludes BYE matchUps with no scheduledDate by default', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'bye-no-date',
        matchUpStatus: BYE,
        scheduledTime: '10:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['bye-no-date'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(0);
  });

  it('excludes matchUps with scheduledDate strictly prior to scheduleDate by default', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'prior-1',
        matchUpStatus: COMPLETED,
        scheduledDate: '2024-05-30',
        scheduledTime: '10:00',
      }),
      buildSinglesMatchUp({
        matchUpId: 'prior-2',
        matchUpStatus: COMPLETED,
        scheduledDate: '2024-05-31',
        scheduledTime: '11:00',
        participantIds: ['p1', 'p3'],
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['prior-1', 'prior-2'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    // p1 played both prior matchUps — neither should count
    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(0);
    expect(getSinglesCount(individualParticipantProfiles, 'p2')).toBe(0);
    expect(getSinglesCount(individualParticipantProfiles, 'p3')).toBe(0);
  });

  it('INCLUDES matchUps with scheduledDate equal to scheduleDate (same-day matchUps still count)', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'today-1',
        matchUpStatus: COMPLETED,
        scheduledDate: '2024-06-01',
        scheduledTime: '08:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['today-1'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    // A SINGLES that finished earlier today still consumes today's budget
    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(1);
    expect(getSinglesCount(individualParticipantProfiles, 'p2')).toBe(1);
  });

  it('INCLUDES hand-scheduled active matchUps on the current date (not in Day Plan but still count)', () => {
    // Simulates: a director hand-scheduled a SINGLES at 16:00 today outside any Day Plan
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'hand-scheduled',
        // intentionally no matchUpStatus — typical for not-yet-played
        scheduledDate: '2024-06-01',
        scheduledTime: '16:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['hand-scheduled'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(1);
  });

  it('INCLUDES in-progress matchUps with no date (rare but not excluded — only COMPLETED/BYE are)', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'in-progress-no-date',
        matchUpStatus: IN_PROGRESS,
        scheduledTime: '10:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['in-progress-no-date'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(1);
  });

  // ============================================================
  // Opt-out (legacy) behavior tests
  // ============================================================

  it('with excludeNoDateCompleted=false, completed-no-date matchUps DO count (legacy behavior)', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'completed-no-date',
        matchUpStatus: COMPLETED,
        scheduledTime: '10:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      excludeNoDateCompleted: false,
      dateScheduledMatchUpIds: ['completed-no-date'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(1);
  });

  it('with excludePriorDates=false, prior-date matchUps DO count (legacy behavior)', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'prior-1',
        matchUpStatus: COMPLETED,
        scheduledDate: '2024-05-30',
        scheduledTime: '10:00',
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['prior-1'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      excludePriorDates: false,
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(1);
  });

  it('with both flags off, legacy unconditional counting is preserved', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'completed-no-date',
        matchUpStatus: COMPLETED,
        scheduledTime: '10:00',
        participantIds: ['p1', 'p2'],
      }),
      buildSinglesMatchUp({
        matchUpId: 'prior-1',
        matchUpStatus: COMPLETED,
        scheduledDate: '2024-05-30',
        scheduledTime: '09:00',
        participantIds: ['p1', 'p3'],
      }),
      buildSinglesMatchUp({
        matchUpId: 'bye-no-date',
        matchUpStatus: BYE,
        scheduledTime: '08:00',
        participantIds: ['p1', 'p4'],
      }),
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      excludeNoDateCompleted: false,
      dateScheduledMatchUpIds: ['completed-no-date', 'prior-1', 'bye-no-date'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      excludePriorDates: false,
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    // p1 should be charged for all three under legacy semantics
    expect(getSinglesCount(individualParticipantProfiles, 'p1')).toBe(3);
  });

  // ============================================================
  // Flag-independent test: excluded matchUps should not poison scheduleTimes
  // ============================================================

  it('does NOT record matchUpScheduleTimes for excluded matchUps', () => {
    const matchUps = [
      buildSinglesMatchUp({
        matchUpId: 'completed-no-date',
        matchUpStatus: COMPLETED,
        scheduledTime: '10:00',
      }),
    ];
    const matchUpScheduleTimes: Record<string, string> = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles: {},
      dateScheduledMatchUpIds: ['completed-no-date'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes,
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    // An excluded (orphan COMPLETED) matchUp must not register a scheduled time
    // — otherwise downstream recovery-time math could anchor off a phantom slot.
    expect(matchUpScheduleTimes['completed-no-date']).toBeUndefined();
  });

  // ============================================================
  // Doubles + total-limit interactions
  // ============================================================

  it('excluded DOUBLES matchUps do not consume DOUBLES or TOTAL counters', () => {
    const matchUps: any[] = [
      {
        matchUpId: 'doubles-prior',
        matchUpType: DOUBLES,
        matchUpStatus: COMPLETED,
        tournamentId: 't1',
        drawId: 'd1',
        sides: [
          { participant: { individualParticipantIds: ['p1', 'p2'] } },
          { participant: { individualParticipantIds: ['p3', 'p4'] } },
        ],
        schedule: { scheduledDate: '2024-05-30', scheduledTime: '10:00' },
      },
    ];
    const individualParticipantProfiles: any = {};

    processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds: {},
      individualParticipantProfiles,
      dateScheduledMatchUpIds: ['doubles-prior'],
      matchUpNotBeforeTimes: {},
      matchUpScheduleTimes: {},
      matchUpDependencies: {},
      scheduleDate: '2024-06-01',
      minutesMap: {},
      matchUps,
    });

    for (const pid of ['p1', 'p2', 'p3', 'p4']) {
      // No DOUBLES counter created at all for excluded matchUps
      expect(individualParticipantProfiles[pid]?.counters?.[DOUBLES]).toBeUndefined();
      expect(getTotalCount(individualParticipantProfiles, pid)).toBe(0);
    }
  });
});

describe('scheduleProfileRounds — exclusion flag threading', () => {
  // End-to-end: the new flags must thread from the public API through
  // scheduleProfileRounds → jinnScheduler → getVenueSchedulingDetails →
  // processAlreadyScheduledMatchUps without breaking the pipeline.
  it.each([
    { excludeNoDateCompleted: true, excludePriorDates: true, label: 'both defaults (true/true)' },
    { excludeNoDateCompleted: false, excludePriorDates: false, label: 'both opted out (false/false)' },
    { excludeNoDateCompleted: true, excludePriorDates: false, label: 'only no-date completed excluded' },
    { excludeNoDateCompleted: false, excludePriorDates: true, label: 'only prior-dates excluded' },
  ])('threads $label through to a successful schedule', ({ excludeNoDateCompleted, excludePriorDates }) => {
    const startDate = '2024-06-01';
    const {
      drawIds: [drawId],
      venueIds: [venueId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4 }],
      drawProfiles: [{ drawSize: 4 }],
      startDate,
      endDate: '2024-06-07',
    });
    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.attachPolicies({ policyDefinitions: POLICY_SCHEDULING_DEFAULT });

    const { tournamentId } = tournamentRecord;
    const {
      event: { eventId },
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = tournamentEngine.getEvent({ drawId });

    const addResult = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
      scheduleDate: startDate,
      venueId,
    });
    expect(addResult.success).toEqual(true);

    const result: any = tournamentEngine.scheduleProfileRounds({
      excludeNoDateCompleted,
      excludePriorDates,
      scheduleDates: [startDate],
    });
    expect(result.success).toEqual(true);
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(2);
  });
});
