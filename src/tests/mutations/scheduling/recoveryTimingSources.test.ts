import { timeStringMinutes, extractTime } from '@Tools/dateTime';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_QF, MAIN } from '@Constants/drawDefinitionConstants';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

// SCHEDULING_PIPELINE_VNEXT.md § 5, found while building the scheduling corpus (2026-10-22). Under the default policy a
// SET3-S:6/TB7 singles matchUp averages 90 minutes and its participants recover for 60.
//   C1 (CA: recovery is calculated): a matchUp already timed on the date holds its participants for its recovery even
//      when the profile is not scheduling it: a COMPLETED matchUp, or one timed outside the profile.
//   Q1 (CA: look for a timing in the tournament or the event): scheduleMatchUps, given no minutes, reads them there.
//   C3 (CA: a default fallback is desirable): with no policy attached, the hydrated `timeAfterRecovery` falls back to
//      the default policy, as the scheduler's round timing always did.

const venueId = 'venue1';
const day = '2026-10-01';
const minutesOf = (matchUp: any) => timeStringMinutes(extractTime(matchUp.schedule?.scheduledTime));
const AVERAGE_PLUS_RECOVERY = 150;

/** two 8 draws over the same 8 participants: every participant plays R1 in both */
function sharedParticipants(policyDefinitions?: any) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 8, venueId }],
    drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }],
    participantsProfile: { participantsCount: 8 },
    policyDefinitions,
    startDate: day,
    endDate: day,
    setState: true,
  });
  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const drawIds = [...new Set(matchUps.map((m: any) => m.drawId))];
  const [first, second] = drawIds.map((drawId) => matchUps.filter((m: any) => m.drawId === drawId));
  return { first, second };
}

/** for every participant, the gap in minutes between their R1 in the first draw and their R1 in the second */
function gaps() {
  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const starts = new Map<string, number[]>();
  for (const matchUp of matchUps)
    for (const side of matchUp.sides ?? []) {
      if (!side.participantId || !matchUp.schedule?.scheduledTime) continue;
      starts.set(side.participantId, [...(starts.get(side.participantId) ?? []), minutesOf(matchUp)]);
    }
  return [...starts.values()].filter((times) => times.length === 2).map(([a, b]) => Math.abs(a - b));
}

describe('C1: a matchUp already timed holds its participants for its recovery', () => {
  it('a completed matchUp: consolation R1 waits for main R1 and its recovery, beside main R2', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 17, venueId }],
      drawProfiles: [{ drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP_TO_QF }],
      // no policy attached: the default policy decides the round timing and, since C3, the hydrated timeAfterRecovery that
      // seeds not-before times, so two mechanisms now hold this; the test timed outside the profile isolates C1's own fix
      startDate: day,
      endDate: day,
      setState: true,
    });
    const { tournamentId, events } = tournamentEngine.getTournament().tournamentRecord;
    const { eventId, drawDefinitions } = events[0];
    const { drawId, structures } = drawDefinitions[0];
    const addRound = (stage: string, roundNumber: number) => {
      const { structureId } = structures.find((structure: any) => structure.stage === stage);
      const result: any = tournamentEngine.addSchedulingProfileRound({
        round: { tournamentId, eventId, drawId, structureId, roundNumber },
        scheduleDate: day,
        venueId,
      });
      expect(result.success).toEqual(true);
    };
    const round = (stage: string, roundNumber: number) =>
      tournamentEngine
        .allTournamentMatchUps()
        .matchUps.filter((m: any) => m.stage === stage && m.roundNumber === roundNumber);

    let result: any = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 2, total: 3 } });
    expect(result.success).toEqual(true);
    addRound(MAIN, 1);
    addRound(MAIN, 2);
    result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [day] });
    expect(result.success).toEqual(true);
    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    for (const { matchUpId } of round(MAIN, 1)) {
      result = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
      expect(result.success).toEqual(true);
    }

    addRound(CONSOLATION, 1);
    result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [day] });
    expect(result.success).toEqual(true);

    const latestMain = Math.max(...round(MAIN, 1).map(minutesOf));
    const consolation = round(CONSOLATION, 1);
    expect(consolation.every((m: any) => m.schedule?.scheduledTime)).toEqual(true);
    // was 09:30: R1's 90 minutes and no recovery
    expect(Math.min(...consolation.map(minutesOf))).toBeGreaterThanOrEqual(latestMain + AVERAGE_PLUS_RECOVERY);
  });

  it('a matchUp timed outside the profile: the other draw waits for its recovery', () => {
    const { first, second } = sharedParticipants(POLICY_SCHEDULING_DEFAULT);
    for (const matchUp of first) {
      const result: any = tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: day, scheduledTime: '08:00' },
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
      });
      expect(result.success).toEqual(true);
    }
    const { tournamentId, events } = tournamentEngine.getTournament().tournamentRecord;
    const event = events.find((e: any) => e.drawDefinitions[0].drawId === second[0].drawId);
    const result: any = tournamentEngine.addSchedulingProfileRound({
      round: {
        structureId: event.drawDefinitions[0].structures[0].structureId,
        drawId: event.drawDefinitions[0].drawId,
        eventId: event.eventId,
        roundNumber: 1,
        tournamentId,
      },
      scheduleDate: day,
      venueId,
    });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.scheduleProfileRounds({ scheduleDates: [day] }).success).toEqual(true);

    const placed = gaps();
    expect(placed.length).toEqual(8);
    expect(Math.min(...placed)).toBeGreaterThanOrEqual(AVERAGE_PLUS_RECOVERY);
  });
});

describe('Q1: scheduleMatchUps reads the timing the tournament states', () => {
  const scheduleBoth = (params: any = {}) => {
    const { first, second } = sharedParticipants(params.policyDefinitions);
    const result: any = tournamentEngine.scheduleMatchUps({
      matchUpIds: [...first, ...second].map((m: any) => m.matchUpId),
      scheduleDate: day,
      ...params.call,
    });
    expect(result.success).toEqual(true);
    return gaps();
  };

  it('with a scheduling policy attached and no minutes in the call, recovery comes from the policy', () => {
    const placed = scheduleBoth({ policyDefinitions: POLICY_SCHEDULING_DEFAULT });
    expect(placed.length).toEqual(8);
    expect(Math.min(...placed)).toBeGreaterThanOrEqual(AVERAGE_PLUS_RECOVERY);
  });

  it('minutes stated in the call still win over the policy', () => {
    const placed = scheduleBoth({
      call: { averageMatchUpMinutes: 90, recoveryMinutes: 0 },
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    });
    expect(placed.length).toEqual(8);
    expect(Math.min(...placed)).toBeLessThan(AVERAGE_PLUS_RECOVERY);
  });

  it('with no timing anywhere, the legacy 90 minutes and no recovery stand', () => {
    const placed = scheduleBoth();
    expect(placed.length).toEqual(8);
    expect(Math.min(...placed)).toBeLessThan(AVERAGE_PLUS_RECOVERY);
  });
});

describe('C3: hydration and the scheduler resolve the same minutes when no policy is attached', () => {
  it('a timed matchUp hydrates its timeAfterRecovery from the default policy', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 8, venueId }],
      drawProfiles: [{ drawSize: 8 }],
      startDate: day,
      endDate: day,
      setState: true,
    });
    const [matchUp] = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: day, scheduledTime: '08:00' },
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
    });
    expect(result.success).toEqual(true);

    const hydrated = tournamentEngine
      .allTournamentMatchUps({ afterRecoveryTimes: true })
      .matchUps.find((m: any) => m.matchUpId === matchUp.matchUpId);
    // was undefined: with no policy the hydration found no minutes, while the scheduler read 90 and 60
    expect(hydrated.schedule.averageMinutes).toEqual(90);
    expect(hydrated.schedule.recoveryMinutes).toEqual(60);
    expect(hydrated.schedule.timeAfterRecovery).toEqual('10:30');
  });
});
