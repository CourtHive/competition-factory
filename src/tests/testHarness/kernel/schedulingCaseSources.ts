import { planningViewData } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { overTheWire } from './kernel';

// constants and types
import type { SchedulePlan } from '@Mutate/matchUps/schedule/pipeline/plan';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import type { KernelCase } from './kernel';

/**
 * The authored `kernel.scheduling.plan@1` cases: one small tournament per rule of `scheduling-pipeline.md` § 3 and § 4,
 * small enough that the whole plan can be read and checked by hand. Each source states its rule as CLAIMS on the plan,
 * derived from the spec rather than from the engine (a Garman slot computed from the formula, a recovery added up), and
 * the case is written only if the plan meets them. The case file then pins the whole plan, so a change anywhere in it is
 * a reviewed change to `cases/scheduling.json` (`KERNEL_SCHEDULING_CASES=write`).
 *
 * Every fixture: one venue opening at 10:00, the default scheduling policy (a best-of-3 standard format averages 90
 * minutes and recovers 60), and the call's default period of 30 minutes.
 */
const DAYS = ['2026-03-02', '2026-03-03'];
const VENUE = 'venue-1';

type Source = {
  caseId: string;
  note: string;
  options?: Record<string, unknown>;
  build: () => void;
  claims: (plan: SchedulePlan, ids: MatchUpIds) => void;
};
type MatchUpIds = { [label: string]: string };

function tournament({ drawSize, courtsCount }: { drawSize: number; courtsCount: number }) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount, startTime: '10:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize }],
    startDate: DAYS[0],
    endDate: DAYS[1],
    setState: true,
  });
}

function profileRounds(rounds: number[], scheduleDate = DAYS[0]) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const [event] = tournamentRecord.events;
  const [drawDefinition] = event.drawDefinitions;
  for (const roundNumber of rounds) {
    const result: any = tournamentEngine.addSchedulingProfileRound({
      round: {
        structureId: drawDefinition.structures[0].structureId,
        tournamentId: tournamentRecord.tournamentId,
        drawId: drawDefinition.drawId,
        eventId: event.eventId,
        roundNumber,
      },
      venueId: VENUE,
      scheduleDate,
    });
    if (!result.success) throw new Error(`profile round ${roundNumber}: ${JSON.stringify(result.error)}`);
  }
}

/** the draw's matchUps as R<round>.<position>, so a claim names a matchUp by where it is */
function matchUpIds(): MatchUpIds {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return Object.fromEntries(matchUps.map((m: any) => [`R${m.roundNumber}.${m.roundPosition}`, m.matchUpId]));
}

function expectEqual(actual: unknown, expected: unknown, what: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const timeOf = (plan: SchedulePlan, matchUpId: string) => plan.matchUpScheduleTimes[matchUpId];

export const schedulingCaseSources: Source[] = [
  {
    caseId: 'scheduling.plan.first-slot-fills-every-court.v1',
    note: 'Two courts and two first-round matchUps: the first Garman slot holds one matchUp per court, so both start at the venue opening.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      profileRounds([1]);
    },
    claims: (plan, ids) => {
      expectEqual([timeOf(plan, ids['R1.1']), timeOf(plan, ids['R1.2'])], ['10:00', '10:00'], 'both at the opening');
    },
  },
  {
    caseId: 'scheduling.plan.garman-one-court.v1',
    note:
      'One court, T = 90, L = 30. Periods number from 0 at the opening (period 0 totals C, period 1 adds none, as ' +
      "Brian Garman's published tables do), and each total is rounded to the nearest match: 1, 1, 1.33 → 1, 1.67 → 2, " +
      'so the second matchUp starts at 11:30, when the first is expected to end (scheduling-pipeline.md § 9.6, decided).',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 1 });
      profileRounds([1]);
    },
    claims: (plan, ids) => {
      expectEqual([timeOf(plan, ids['R1.1']), timeOf(plan, ids['R1.2'])], ['10:00', '11:30'], 'Garman periods');
    },
  },
  {
    caseId: 'scheduling.plan.final-waits-for-recovery.v1',
    note:
      'Both semifinals at 10:00 on two courts; their players are free at 10:00 + 90 + 60 = 12:30, so the final, profiled ' +
      'the same day, takes the first slot at or after 12:30, which is 12:30 (two courts: 10:00, 10:00, 11:00, 12:00, ' +
      '12:30, ...).',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      profileRounds([1, 2]);
    },
    claims: (plan, ids) => {
      expectEqual([timeOf(plan, ids['R1.1']), timeOf(plan, ids['R1.2'])], ['10:00', '10:00'], 'semifinals');
      expectEqual(timeOf(plan, ids['R2.1']), '12:30', 'the final after recovery');
    },
  },
  {
    caseId: 'scheduling.plan.person-request-on-a-placed-side.v1',
    note:
      'A DO_NOT_SCHEDULE request from 10:00 to 11:30 for a participant placed in the matchUp: a 90 minute matchUp ' +
      "overlaps it from any start before 11:30, so the 10:00 slot is refused and the matchUp takes the court's next " +
      'slot, 11:30.',
    build: () => {
      tournament({ drawSize: 2, courtsCount: 1 });
      profileRounds([1]);
      const [matchUp] = tournamentEngine.allTournamentMatchUps().matchUps;
      const result: any = tournamentEngine.addPersonRequests({
        requests: [{ date: DAYS[0], startTime: '10:00', endTime: '11:30', requestType: DO_NOT_SCHEDULE }],
        personId: matchUp.sides[0].participant.person.personId,
      });
      if (!result.success) throw new Error('person request');
    },
    claims: (plan, ids) => {
      expectEqual(timeOf(plan, ids['R1.1']), '11:30', 'the first slot after the request window');
      // the conflict is reported against the request, beside the date keys (scheduling-pipeline.md § 9.7)
      const conflicts = Object.values(plan.requestConflicts as Record<string, any>).filter((entry) => entry?.request);
      expectEqual(
        conflicts.map(({ scheduleTimes, matchUpIds }) => ({ scheduleTimes, matchUpIds })),
        [{ scheduleTimes: ['10:00'], matchUpIds: [ids['R1.1']] }],
        'the refused slot is reported against the request',
      );
    },
  },
  {
    caseId: 'scheduling.plan.daily-limit-holds-the-final.v1',
    note:
      'A daily limit of one singles matchUp: every finalist is already booked for a semifinal on the date, so the final ' +
      'is over the limit and reported as such, never timed.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      const result: any = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 1, total: 1 } });
      if (!result.success) throw new Error('daily limits');
      profileRounds([1, 2]);
    },
    claims: (plan, ids) => {
      expectEqual(timeOf(plan, ids['R2.1']), undefined, 'the final is not timed');
      expectEqual(plan.overLimitMatchUpIds[DAYS[0]], [ids['R2.1']], 'reported over the limit');
    },
  },
  {
    caseId: 'scheduling.plan.no-court-available.v1',
    note: "The venue's only court is disabled on the date: there are no slots, and every profiled matchUp is reported without a time.",
    build: () => {
      tournament({ drawSize: 2, courtsCount: 1 });
      const { courts } = tournamentEngine.getVenuesAndCourts();
      const result: any = tournamentEngine.disableCourts({
        courtIds: courts.map((c: any) => c.courtId),
        dates: [DAYS[0]],
      });
      if (!result.success) throw new Error('disable courts');
      profileRounds([1]);
    },
    claims: (plan, ids) => {
      expectEqual(plan.matchUpScheduleTimes, {}, 'nothing timed');
      expectEqual(plan.noTimeMatchUpIds[DAYS[0]], [ids['R1.1']], 'reported without a time');
    },
  },
  {
    caseId: 'scheduling.plan.played-source-on-a-later-date.v1',
    note:
      'Both semifinals were played on day 2 and the final is profiled on day 1: every slot on day 1 is before its played ' +
      'sources, so the final is held back under the played order and not reported as merely untimed.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
      const { tournamentRecord } = tournamentEngine.getTournament();
      const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
      for (const matchUp of tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
        .matchUps) {
        let result: any = tournamentEngine.addMatchUpScheduleItems({
          schedule: { scheduledDate: DAYS[1], scheduledTime: '10:00' },
          matchUpId: matchUp.matchUpId,
          drawId,
        });
        if (!result.success) throw new Error('schedule semifinal');
        result = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId, outcome });
        if (!result.success) throw new Error('score semifinal');
      }
      profileRounds([2]);
    },
    claims: (plan, ids) => {
      expectEqual(timeOf(plan, ids['R2.1']), undefined, 'the final is not timed');
      expectEqual(Object.keys(plan.playedOrderDeferredMatchUpIds[DAYS[0]]), [ids['R2.1']], 'held by the played order');
      expectEqual(plan.noTimeMatchUpIds[DAYS[0]], [], 'not reported as untimed');
    },
  },
];

/**
 * Each source built, planned and held to its claims; the case it yields pins the whole plan. Every source is built on a
 * seeded random source and a fixed clock, so its ids and its view are the same whichever test builds it.
 */
export function authoredSchedulingCases(): KernelCase[] {
  try {
    return schedulingCaseSources.map(authoredCase);
  } finally {
    setRandomSource();
    setClock();
  }
}

function authoredCase({ caseId, note, options = {}, build, claims }: Source): KernelCase {
  setRandomSource(20260302);
  setClock('2026-03-01T08:00:00.000Z');
  build();
  const { tournamentRecord } = tournamentEngine.getTournament();
  const view = buildSchedulingView({
    ...options,
    tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
  });
  if ('error' in view) throw new Error(`${caseId}: ${JSON.stringify(view.error)}`);
  const plan = planSchedule({ ...options, view });
  claims(plan, matchUpIds());
  return {
    caseId,
    operation: 'kernel.scheduling.plan@1',
    input: { view: planningViewData(view), options },
    expected: { kind: 'value', value: overTheWire(plan) },
    note,
  };
}
