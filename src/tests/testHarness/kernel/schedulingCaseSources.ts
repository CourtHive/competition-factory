import { planningViewData } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { normativePlan } from './normativePlan';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { viewOptionsOf } from './viewOptions';
import { overTheWire } from './kernel';

// constants and types
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import type { SchedulePlan } from '@Mutate/matchUps/schedule/pipeline/plan';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import type { KernelCase } from './kernel';

/**
 * The authored `kernel.scheduling.plan@2` cases: one small tournament per rule of `scheduling-pipeline.md` § 3 and § 4,
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
  /** a change to the built view, for a record shape the engine's own methods do not write */
  amendView?: (view: any) => void;
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

/** two events at the one-court venue, each with its own participants; the second event's format is `format` */
function twoEvents({
  format,
  courtsCount = 1,
  secondVenue,
}: {
  format?: string;
  courtsCount?: number;
  secondVenue?: boolean;
}) {
  const venueProfiles = [{ venueId: VENUE, courtsCount, startTime: '10:00', endTime: '20:00' }];
  if (secondVenue)
    venueProfiles.push({ venueId: 'second-venue', courtsCount: 1, startTime: '10:00', endTime: '20:00' });
  mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles: [
      { drawSize: 2, uniqueParticipants: true },
      { drawSize: 4, uniqueParticipants: true },
    ],
    startDate: DAYS[0],
    endDate: DAYS[1],
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  if (format) {
    const result: any = tournamentEngine.setMatchUpFormat({
      drawId: tournamentRecord.events[1].drawDefinitions[0].drawId,
      matchUpFormat: format,
    });
    if (!result.success) throw new Error('format');
  }
}
function eventMatchUps(eventIndex: number, roundNumber: number) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const drawId = tournamentRecord.events[eventIndex].drawDefinitions[0].drawId;
  return tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], roundNumbers: [roundNumber] } })
    .matchUps.sort((a: any, b: any) => a.roundPosition - b.roundPosition);
}
function profileEventRound(eventIndex: number, roundNumber: number, scheduleDate = DAYS[0], venueId = VENUE) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const event = tournamentRecord.events[eventIndex];
  const drawDefinition = event.drawDefinitions[0];
  const result: any = tournamentEngine.addSchedulingProfileRound({
    round: {
      structureId: drawDefinition.structures[0].structureId,
      tournamentId: tournamentRecord.tournamentId,
      drawId: drawDefinition.drawId,
      eventId: event.eventId,
      roundNumber,
    },
    venueId,
    scheduleDate,
  });
  if (!result.success) throw new Error('profile');
}
function timeMatchUp(matchUp: any, schedule: Record<string, unknown>) {
  const result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: DAYS[0], ...schedule },
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  if (!result.success) throw new Error('schedule');
}
const firstCourtId = () => tournamentEngine.getVenuesAndCourts().courts[0].courtId;
const timesOf = (plan: SchedulePlan, matchUps: any[]) => matchUps.map(({ matchUpId }) => timeOf(plan, matchUpId));

/** a short format (30 minutes, 30 recovery), profiled beside a 90 minute round to tell a venue's figure from its own */
const SHORT_FORMAT = 'SET1-S:6/TB7';

/** a second venue: transit cases time a draw's semifinals at VENUE and profile its final here */
const OTHER_VENUE = 'venue-2';

/** four players in the short format at two venues of one court each; the semifinals timed at 10:00 at VENUE */
function semifinalsAtOneVenue({ policyDefinitions }: { policyDefinitions?: Record<string, unknown> } = {}) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [VENUE, OTHER_VENUE].map((venueId) => ({
      venueId,
      courtsCount: 1,
      startTime: '10:00',
      endTime: '20:00',
    })),
    drawProfiles: [{ drawSize: 4, matchUpFormat: SHORT_FORMAT }],
    startDate: DAYS[0],
    endDate: DAYS[1],
    policyDefinitions,
    setState: true,
  });
  for (const semifinal of eventMatchUps(0, 1)) timeMatchUp(semifinal, { scheduledTime: '10:00', venueId: VENUE });
  profileEventRound(0, 2, DAYS[0], OTHER_VENUE);
}

/** the default scheduling policy, with its transit minutes changed: a partial policy would replace its timings too */
function withTransitMinutes(transitMinutes: number) {
  const policy: any = structuredClone(POLICY_SCHEDULING_DEFAULT);
  policy[POLICY_TYPE_SCHEDULING].defaultTimes.transitMinutes = transitMinutes;
  return policy;
}

/** a participant of the matchUp, for a person request */
const personOf = (matchUp: any) => matchUp.sides[0].participant.person.personId;

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
      // the conflict is reported under its date, against the request (scheduling-pipeline.md § 9.7)
      const conflicts = plan.requestConflicts[DAYS[0]] as { scheduleTimes: string[]; matchUpIds: string[] }[];
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
  {
    caseId: 'scheduling.plan.booking-holds-its-own-minutes.v1',
    note:
      'A standard best-of-3 matchUp (90 minutes, § 3.3) is timed at 10:00 on the only court; a round of timed ' +
      "SET3-S:T20/TB7 matchUps (60 minutes) is profiled. The court is held for the timed matchUp's own 90 minutes, not " +
      "the profiled round's 60, so the round starts at 11:30 and 12:30.",
    build: () => {
      twoEvents({ format: 'SET3-S:T20/TB7' });
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '10:00', venueId: VENUE, courtId: firstCourtId() });
      profileEventRound(1, 1);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1)), ['11:30', '12:30'], 'after the 90 minute booking');
    },
  },
  {
    caseId: 'scheduling.plan.bookings-survive-a-malformed-matchup.v1',
    note:
      'A matchUp timed at 10:00 on the only court, and a matchUp elsewhere in the view with three draw positions. ' +
      'A booking reads a schedule, not draw positions: the court is still held, and the profiled matchUp starts at 11:30.',
    build: () => {
      twoEvents({});
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '10:00', venueId: VENUE, courtId: firstCourtId() });
      profileEventRound(1, 1);
    },
    amendView: (view) => {
      const final = eventMatchUps(1, 2)[0];
      view.hydrated.find(({ matchUpId }: any) => matchUpId === final.matchUpId).drawPositions = [1, 2, 3];
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1))[0], '11:30', 'the court is still booked');
    },
  },
  {
    caseId: 'scheduling.plan.venue-only-booking-takes-a-court.v1',
    note:
      "A matchUp timed at 10:00 at the venue with no court holds one of the venue's courts for its 90 minutes: the " +
      'profiled matchUp on the only court starts at 11:30.',
    build: () => {
      twoEvents({});
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '10:00', venueId: VENUE });
      profileEventRound(1, 1);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1))[0], '11:30', 'a court of the venue is held');
    },
  },
  {
    caseId: 'scheduling.plan.timed-without-a-venue-books-no-court.v1',
    note:
      'In a tournament with two venues, a matchUp timed at 10:00 with neither a venue nor a court claims no court: ' +
      'the profiled matchUp takes the court at 10:00 (its participants are still held, § 3.4).',
    build: () => {
      twoEvents({ secondVenue: true });
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '10:00' });
      profileEventRound(1, 1);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1))[0], '10:00', 'no court is held');
    },
  },
  {
    caseId: 'scheduling.plan.timed-without-a-venue-at-the-only-venue.v1',
    note:
      'In a tournament with exactly one venue, a matchUp timed at 10:00 with no venue is at that venue (CA 2026-10-25): ' +
      'it holds the only court until 11:30, so the profiled matchUp is timed at 11:30.',
    build: () => {
      twoEvents({});
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '10:00' });
      profileEventRound(1, 1);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1))[0], '11:30', 'the only venue holds it');
    },
  },
  {
    caseId: 'scheduling.plan.scheduled-bye-holds-no-one.v1',
    note:
      'A BYE carries a schedule (10:00 on day 2) and the final is profiled on day 2 under a daily limit of one singles ' +
      "matchUp. A BYE is never played: it adds nothing to its participant's day and raises no not-before time, so the " +
      'final is timed at 10:00, not held over the limit.',
    build: () => {
      mocksEngine.generateTournamentRecord({
        venueProfiles: [{ venueId: VENUE, courtsCount: 2, startTime: '10:00', endTime: '20:00' }],
        drawProfiles: [{ drawSize: 4, participantsCount: 3 }],
        startDate: DAYS[0],
        endDate: DAYS[1],
        setState: true,
      });
      const firstRound = eventMatchUps(0, 1);
      const played = firstRound.find((m: any) => m.matchUpStatus !== 'BYE');
      const bye = firstRound.find((m: any) => m.matchUpStatus === 'BYE');
      timeMatchUp(played, { scheduledTime: '10:00', venueId: VENUE });
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
      let result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: played.matchUpId,
        drawId: played.drawId,
        outcome,
      });
      if (!result.success) throw new Error('score');
      timeMatchUp(bye, { scheduledDate: DAYS[1], scheduledTime: '10:00', venueId: VENUE });
      result = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 1, total: 1 } });
      if (!result.success) throw new Error('daily limits');
      profileEventRound(0, 2, DAYS[1]);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['10:00'], 'the final is not held by the BYE');
    },
  },
  {
    caseId: 'scheduling.plan.stored-matchup-holds-its-own-minutes.v1',
    note:
      'The short-format semifinals (SET1-S:6/TB7: 30 minutes, 30 recovery) are timed at 10:00; a 90 minute round of ' +
      'another event is profiled at the same venue, with the final. A stored matchUp holds its participants for its own ' +
      "minutes (CA 2026-10-25), not the venue's greatest average: the finalists are free at 11:00.",
    build: () => {
      twoEvents({ format: SHORT_FORMAT, courtsCount: 3 });
      for (const semifinal of eventMatchUps(1, 1)) timeMatchUp(semifinal, { scheduledTime: '10:00', venueId: VENUE });
      profileEventRound(0, 1);
      profileEventRound(1, 2);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 2)), ['11:00'], "the final after its semifinals' own minutes");
    },
  },
  {
    caseId: 'scheduling.plan.placed-matchup-holds-its-own-minutes.v1',
    note:
      'Short-format semifinals and their final (SET1-S:6/TB7: 30 minutes, 30 recovery) are profiled with a 90 minute ' +
      "round of another event at the same venue. A placed matchUp holds its participants for its round's own average " +
      "(CA 2026-10-25), the figure its recovery is checked with, not the venue's greatest.",
    build: () => {
      twoEvents({ format: SHORT_FORMAT, courtsCount: 3 });
      profileEventRound(0, 1);
      profileEventRound(1, 1);
      profileEventRound(1, 2);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1)), ['10:00', '10:00'], 'the semifinals');
      expectEqual(timesOf(plan, eventMatchUps(1, 2)), ['11:00'], 'the final after their own minutes');
    },
  },
  {
    caseId: 'scheduling.plan.request-window-is-the-matchup-minutes.v1',
    note:
      'A DO_NOT_SCHEDULE request from 10:45 for a participant of a short-format semifinal (30 minutes), profiled with a ' +
      "90 minute round at the same venue. The request is checked against the matchUp's own minutes (CA 2026-10-25): " +
      '10:00 to 10:30 does not reach it, so the semifinal is timed at 10:00.',
    build: () => {
      twoEvents({ format: SHORT_FORMAT, courtsCount: 3 });
      profileEventRound(0, 1);
      profileEventRound(1, 1);
      const [semifinal] = eventMatchUps(1, 1);
      const result: any = tournamentEngine.addPersonRequests({
        requests: [{ date: DAYS[0], startTime: '10:45', endTime: '12:00', requestType: DO_NOT_SCHEDULE }],
        personId: personOf(semifinal),
      });
      if (!result.success) throw new Error('person request');
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(1, 1)), ['10:00', '10:00'], 'the semifinals');
    },
  },
  {
    caseId: 'scheduling.plan.replanned-matchup-forgets-its-old-time.v1',
    note:
      'A first-round matchUp timed at 18:00 on day 1 is profiled again on day 2 with the final. It is placed at 10:00, and ' +
      'its targets wait only for where it is placed now (CA 2026-10-25): its day-1 recovery end (20:30) is no not-before time.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      const firstRound = tournamentEngine
        .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
        .matchUps.sort((a: any, b: any) => a.roundPosition - b.roundPosition);
      timeMatchUp(firstRound[0], { scheduledDate: DAYS[0], scheduledTime: '18:00', venueId: VENUE });
      profileRounds([1, 2], DAYS[1]);
    },
    claims: (plan, ids) => {
      expectEqual([timeOf(plan, ids['R1.1']), timeOf(plan, ids['R2.1'])], ['10:00', '12:30'], 'both rounds on day 2');
    },
  },
  {
    caseId: 'scheduling.plan.venue-turn-is-its-open-courts.v1',
    note:
      'Two venues (6 courts and 1) share one field of 16 players across two draws, their rounds profiled at both. A ' +
      "venue's turn ends once it has placed as many matchUps as it has courts open on the date (CA 2026-10-25); it ran " +
      'to one more, counting every court of the venue. The turns decide which venue reaches a shared player first: ' +
      '17 matchUps are timed, not 16.',
    build: () => {
      const venues = [0, 1].map((index) => ({ venueId: `venue-${index}`, rounds: [] as any[] }));
      for (const [draw, roundNumber, venue] of [
        [0, 1, 0],
        [1, 1, 1],
        [0, 2, 1],
        [1, 2, 0],
      ])
        venues[venue].rounds.push({ drawId: `draw-${draw}`, roundNumber });
      mocksEngine.generateTournamentRecord({
        venueProfiles: [6, 1].map((courtsCount, index) => ({
          venueId: `venue-${index}`,
          startTime: '08:00',
          endTime: '20:00',
          courtsCount,
        })),
        drawProfiles: [0, 1].map((draw) => ({ drawId: `draw-${draw}`, drawSize: 16, uniqueParticipants: false })),
        schedulingProfile: [{ scheduleDate: DAYS[0], venues }],
        participantsProfile: { participantsCount: 16 },
        startDate: DAYS[0],
        endDate: DAYS[0],
        setState: true,
      });
    },
    claims: (plan) => {
      expectEqual(plan.scheduledMatchUpIds[DAYS[0]].length, 17, 'matchUps timed');
    },
  },
  {
    caseId: 'scheduling.plan.booking-no-court-can-hold-is-reported.v1',
    note:
      "A matchUp timed at 19:00 at the venue with no court runs 90 minutes, past the courts' 20:00 close: no court's free " +
      'time ends around it, so it holds none, and the plan reports it under unbookedMatchUpIds rather than dropping it ' +
      '(§ 3.9 rule 4).',
    build: () => {
      twoEvents({});
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '19:00', venueId: VENUE });
      profileEventRound(1, 1);
    },
    claims: (plan) => {
      expectEqual(plan.unbookedMatchUpIds[DAYS[0]], { [VENUE]: [eventMatchUps(0, 1)[0].matchUpId] }, 'reported');
    },
  },
  {
    caseId: 'scheduling.plan.transit-longer-than-recovery-holds.v1',
    note:
      'The semifinals (30 minutes, 30 recovery) end at 10:30 at one venue; the final is profiled at another, 60 minutes ' +
      'away. Recovery counts toward transit, so the finalists are free at the greater: 10:30 + 60 = 11:30 (CA 2026-10-25).',
    build: () => semifinalsAtOneVenue(),
    amendView: (view) => (view.transit = { pairs: { [VENUE]: { [OTHER_VENUE]: 60 } } }),
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['11:30'], 'after the transit'),
  },
  {
    caseId: 'scheduling.plan.transit-shorter-than-recovery-adds-nothing.v1',
    note: 'The same, 15 minutes away: recovery (to 11:00) is the greater, and transit adds nothing.',
    build: () => semifinalsAtOneVenue(),
    amendView: (view) => (view.transit = { pairs: { [VENUE]: { [OTHER_VENUE]: 15 } } }),
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['11:00'], 'after the recovery'),
  },
  {
    caseId: 'scheduling.plan.transit-default-for-an-unstated-pair.v1',
    note: 'No minutes stated for the pair: the default (60) applies, so the final is at 11:30.',
    build: () => semifinalsAtOneVenue(),
    amendView: (view) => (view.transit = { defaultMinutes: 60 }),
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['11:30'], 'after the default transit'),
  },
  {
    caseId: 'scheduling.plan.transit-none-within-a-facility.v1',
    note: 'The two venues share a facility: one physical place, no transit, whatever the default (60). The final is at 11:00.',
    build: () => semifinalsAtOneVenue(),
    amendView: (view) =>
      (view.transit = { defaultMinutes: 60, facilityIds: { [VENUE]: 'facility-1', [OTHER_VENUE]: 'facility-1' } }),
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['11:00'], 'no transit'),
  },
  {
    caseId: 'scheduling.plan.transit-one-way-applies-one-way.v1',
    note:
      'A one-way value from the second venue back to the first (60), none the other way and no default: going from the ' +
      'first venue to the second takes no transit, so the final is at 11:00.',
    build: () => semifinalsAtOneVenue(),
    amendView: (view) => (view.transit = { pairs: { [OTHER_VENUE]: { [VENUE]: 60 } } }),
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['11:00'], 'the other direction only'),
  },
  {
    caseId: 'scheduling.plan.transit-default-from-the-policy.v1',
    note:
      'The attached scheduling policy states defaultTimes.transitMinutes of 60: the view reads it as the default for a ' +
      'pair with no stated minutes, and the final is at 11:30.',
    build: () =>
      semifinalsAtOneVenue({
        policyDefinitions: withTransitMinutes(60),
      }),
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['11:30'], "the policy's transit"),
  },
  {
    caseId: 'scheduling.plan.event-date-skips-per-event.v1',
    note:
      'Two events profiled on the first date (a Monday). The first plays Tuesdays only (event weekdays), so its round is ' +
      'skipped on the Monday: the view gives it no matchUps and no minutes, and nothing of it is timed (§ 4, step 2). The ' +
      "second event plays every day and is timed as though the first were not profiled. Skipping is per event, by the round's event.",
    build: () => {
      twoEvents({ courtsCount: 2 });
      const { tournamentRecord } = tournamentEngine.getTournament();
      const result: any = tournamentEngine.setEventDates({
        eventId: tournamentRecord.events[0].eventId,
        weekdays: ['TUE'],
      });
      if (!result.success) throw new Error('event dates');
      profileEventRound(0, 1, DAYS[0]);
      profileEventRound(1, 1, DAYS[0]);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(0, 1)), [undefined], 'the Tuesday event is not timed on the Monday');
      expectEqual(timesOf(plan, eventMatchUps(1, 1)), ['10:00', '10:00'], 'the other event is timed');
    },
  },
  {
    caseId: 'scheduling.plan.event-date-allowed-inactive.v1',
    note:
      "As the case before, with the call's allowInactiveEventDates: the round of the event that does not play on the date " +
      'is planned like any other, and a run warns about each placement it makes.',
    options: { allowInactiveEventDates: true },
    build: () => {
      twoEvents({ courtsCount: 3 });
      const { tournamentRecord } = tournamentEngine.getTournament();
      const result: any = tournamentEngine.setEventDates({
        eventId: tournamentRecord.events[0].eventId,
        weekdays: ['TUE'],
      });
      if (!result.success) throw new Error('event dates');
      profileEventRound(0, 1, DAYS[0]);
      profileEventRound(1, 1, DAYS[0]);
    },
    claims: (plan) => {
      expectEqual(timesOf(plan, eventMatchUps(0, 1)), ['10:00'], 'the Tuesday event is timed on the Monday');
      expectEqual(timesOf(plan, eventMatchUps(1, 1)), ['10:00', '10:00'], 'the other event is timed');
    },
  },
  {
    caseId: 'scheduling.plan.cleared-date-carries-nothing.v1',
    note:
      'A matchUp stored at 23:00 on the first date runs past midnight, but the call clears the first date, which it plans: ' +
      'what is stored there is gone and carries no court into the next date (§ 9.8). On the second date the court opens at ' +
      '00:00 and the profiled matchUp is timed then, not at 00:30.',
    options: { clearScheduleDates: [DAYS[0]] },
    build: () => {
      mocksEngine.generateTournamentRecord({
        venueProfiles: [{ venueId: VENUE, courtsCount: 1, startTime: '00:00', endTime: '23:59' }],
        drawProfiles: [
          { drawSize: 2, uniqueParticipants: true },
          { drawSize: 2, uniqueParticipants: true },
        ],
        startDate: DAYS[0],
        endDate: DAYS[1],
        setState: true,
      });
      timeMatchUp(eventMatchUps(0, 1)[0], { scheduledTime: '23:00', venueId: VENUE, courtId: firstCourtId() });
      profileEventRound(0, 1, DAYS[0]);
      profileEventRound(1, 1, DAYS[1]);
    },
    claims: (plan) => expectEqual(timesOf(plan, eventMatchUps(1, 1)), ['00:00'], 'no carry from a cleared date'),
  },
  {
    caseId: 'scheduling.plan.overnight-rest-is-warned-not-held.v1',
    note:
      'A junior first-round matchUp is timed at 21:00 on the first date (90 minutes: play ends 22:30). The default ' +
      "policy's overnight rest for JUNIOR is 12 hours, which a player may waive: it is warned, not held (§ 9.8, CA " +
      '2026-10-25). Recovery alone ends the night before, so the final takes the first slot of the next date, 08:00.',
    build: () => {
      mocksEngine.generateTournamentRecord({
        venueProfiles: [{ venueId: VENUE, courtsCount: 1, startTime: '08:00', endTime: '23:00' }],
        drawProfiles: [{ drawSize: 4, category: { categoryType: 'JUNIOR', ageCategoryCode: 'U18' } }],
        policyDefinitions: POLICY_SCHEDULING_DEFAULT,
        startDate: DAYS[0],
        endDate: DAYS[1],
        setState: true,
      });
      for (const firstRound of eventMatchUps(0, 1)) timeMatchUp(firstRound, { scheduledTime: '21:00', venueId: VENUE });
      profileEventRound(0, 2, DAYS[1]);
    },
    claims: (plan) =>
      expectEqual(timesOf(plan, eventMatchUps(0, 2)), ['08:00'], 'the overnight rest does not hold the final'),
  },
];

/**
 * Each source built, planned and held to its claims; the case it yields pins the whole plan. Every source is built on a
 * seeded random source and a fixed clock, so its ids and its view are the same whichever test builds it.
 *
 * Each source also yields a `kernel.scheduling.view@1` case: the records it built and the call's view options in, the
 * view as built (before any `amendView`) out. A plan case is graded from a given view; a view case grades the view
 * itself, the hydration, the graph and the profile's rounds a second implementation must derive from the records.
 */
export function authoredSchedulingCases(): { plan: KernelCase[]; view: KernelCase[] } {
  try {
    const built = schedulingCaseSources.map(authoredCases);
    return { plan: built.map(({ plan }) => plan), view: built.map(({ view }) => view) };
  } finally {
    setRandomSource();
    setClock();
  }
}

function authoredCases({ caseId, note, options = {}, amendView, build, claims }: Source) {
  setRandomSource(20260302);
  setClock('2026-03-01T08:00:00.000Z');
  build();
  const { tournamentRecord } = tournamentEngine.getTournament();
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  // the engine's version stamp is when the records were built, not what the view reads: a case carrying it would change
  // with every release (7.23.0's version bump broke the committed cases on master)
  const recordsIn = overTheWire(Object.values(tournamentRecords)).map(({ factory: _stamp, ...record }) => record);
  const view = buildSchedulingView({ ...options, tournamentRecords });
  if ('error' in view) throw new Error(`${caseId}: ${JSON.stringify(view.error)}`);
  const viewCase: KernelCase = {
    caseId: caseId.replace(/^scheduling\.plan\./, 'scheduling.view.'),
    operation: 'kernel.scheduling.view@1',
    input: { tournamentRecords: recordsIn, options: viewOptionsOf(options) },
    expected: { kind: 'value', value: overTheWire(planningViewData(view)) },
    note,
  };
  amendView?.(view);
  // allowInactiveEventDates is read by the view alone: the plan is given the view it shaped
  const { allowInactiveEventDates: _viewOnly, ...planOptions } = options;
  const plan = planSchedule({ ...planOptions, view });
  claims(plan, matchUpIds());
  const planCase: KernelCase = {
    caseId,
    operation: 'kernel.scheduling.plan@2',
    input: { view: planningViewData(view), options: planOptions },
    expected: { kind: 'value', value: overTheWire(normativePlan(plan)) },
    note,
  };
  return { plan: planCase, view: viewCase };
}
