import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { getCompetitionMatchUps } from '@Query/matchUps/getCompetitionMatchUps';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { drawMatchUps } from '@Query/matchUps/getDrawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, test, vi } from 'vitest';

// Fixtures
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

// Queries that accepted a param and did not act on it:
// - the competition queries dropped `contextProfile`, so a caller entering at them directly (rather than through an
//   engine, which redacts on its own) got no `exclude`, and no `withCompetitiveness` by any route;
// - `allDrawMatchUps` dropped `usePublishState` and `publishStatus`, so the public API returned the operational view;
// - only `allEventMatchUps` derived the scheduling policy's timing, so `afterRecoveryTimes` did nothing in the
//   grouped queries or in `allDrawMatchUps`;
// - only `eventMatchUps` derived the event's publish status, so an embargo held only through that query.

afterEach(() => {
  vi.useRealTimers();
});

const DRAW_ID = 'drawId';
const EVENT_ID = 'eventId';
const SCHEDULED_DATE = '2026-06-22';
const VENUE_ID = 'venueId';

function scheduledTournament() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '21:00', venueId: VENUE_ID }],
    drawProfiles: [{ drawId: DRAW_ID, eventId: EVENT_ID, drawSize: 8 }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    startDate: SCHEDULED_DATE,
    endDate: '2026-06-28',
    setState: true,
  });

  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const firstRound = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
  const [scheduled] = firstRound;
  tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '10:00', venueId: VENUE_ID, courtId: courts[0].courtId },
    matchUpId: scheduled.matchUpId,
    drawId: DRAW_ID,
  });

  const record = tournamentEngine.getTournament().tournamentRecord;
  return {
    tournamentRecord: record,
    tournamentRecords: { [record.tournamentId]: record },
    matchUpId: scheduled.matchUpId,
  };
}

test('getCompetitionMatchUps and allCompetitionMatchUps redact what contextProfile.exclude names', () => {
  const { tournamentRecords } = scheduledTournament();
  const contextProfile = { exclude: ['schedule'] };

  const all: any = allCompetitionMatchUps({ tournamentRecords, contextProfile });
  expect(all.matchUps.length).toBeGreaterThan(0);
  expect(all.matchUps.every((m) => m.hasContext && !('schedule' in m))).toEqual(true);

  const grouped: any = getCompetitionMatchUps({ tournamentRecords, contextProfile });
  const groupedMatchUps = [...grouped.upcomingMatchUps, ...grouped.pendingMatchUps];
  expect(groupedMatchUps.length).toBeGreaterThan(0);
  expect(groupedMatchUps.every((m) => !('schedule' in m))).toEqual(true);

  // the caller's params are left as they were given
  expect(contextProfile).toEqual({ exclude: ['schedule'] });
});

test('competitionScheduleMatchUps schedules on full matchUps and redacts only what it returns', () => {
  const { tournamentRecords, matchUpId } = scheduledTournament();
  const matchUpFilters = { scheduledDate: SCHEDULED_DATE };

  const baseline: any = competitionScheduleMatchUps({ tournamentRecords, matchUpFilters });
  expect(baseline.dateMatchUps.map((m) => m.matchUpId)).toEqual([matchUpId]);
  expect(baseline.dateMatchUps[0].schedule.scheduledTime).toBeDefined();

  const result: any = competitionScheduleMatchUps({
    contextProfile: { exclude: ['schedule'] },
    tournamentRecords,
    matchUpFilters,
  });
  // the date filter and the court lookup read `schedule`, so they must run before it is removed
  expect(result.dateMatchUps.map((m) => m.matchUpId)).toEqual([matchUpId]);
  const courtMatchUps = result.courtsData.flatMap((court) => court.matchUps);
  expect(courtMatchUps.map((m) => m.matchUpId)).toEqual([matchUpId]);
  expect([...result.dateMatchUps, ...courtMatchUps].every((m) => !('schedule' in m))).toEqual(true);
});

test('the competition queries pass the rest of contextProfile down', () => {
  const { tournamentRecord, tournamentRecords } = scheduledTournament();
  const contextProfile = { withCompetitiveness: true };
  const profiled = (matchUps) => matchUps.filter((m) => m.competitiveProfile).length;

  const expected = profiled(allTournamentMatchUps({ tournamentRecord, contextProfile }).matchUps);
  expect(expected).toBeGreaterThan(0);
  expect(profiled(allCompetitionMatchUps({ tournamentRecords, contextProfile }).matchUps)).toEqual(expected);

  const grouped: any = getCompetitionMatchUps({ tournamentRecords, contextProfile });
  expect(profiled([...grouped.upcomingMatchUps, ...grouped.pendingMatchUps])).toEqual(expected);
});

test('every matchUp query honours afterRecoveryTimes', () => {
  const { tournamentRecord, tournamentRecords, matchUpId } = scheduledTournament();
  const recoveryOf = (matchUps) => matchUps.find((m) => m.matchUpId === matchUpId)?.schedule?.timeAfterRecovery;
  const grouped = (result) => [...result.upcomingMatchUps, ...result.pendingMatchUps];

  // 90 minutes for the match and 60 to recover, from POLICY_SCHEDULING_DEFAULT
  const expected = recoveryOf(allEventMatchUps(eventParams(tournamentRecord, { afterRecoveryTimes: true })).matchUps);
  expect(expected).toEqual('12:30');

  const params = eventParams(tournamentRecord, { afterRecoveryTimes: true });
  expect(recoveryOf(allDrawMatchUps(params).matchUps)).toEqual(expected);
  expect(recoveryOf(grouped(drawMatchUps(params)))).toEqual(expected);
  expect(recoveryOf(grouped(getCompetitionMatchUps({ tournamentRecords, afterRecoveryTimes: true })))).toEqual(
    expected,
  );
  expect(
    recoveryOf(
      tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, afterRecoveryTimes: true, inContext: true }).matchUps,
    ),
  ).toEqual(expected);
});

function eventParams(record, extra = {}) {
  const event = record.events.find((e) => e.eventId === EVENT_ID);
  const drawDefinition = event.drawDefinitions.find((d) => d.drawId === DRAW_ID);
  return { tournamentRecord: record, drawDefinition, event, inContext: true, ...extra };
}

test('allDrawMatchUps and allEventMatchUps apply a supplied publishStatus as drawMatchUps does', () => {
  const { matchUpId } = scheduledTournament();
  tournamentEngine.setMatchUpScheduleLock({ matchUpId, drawId: DRAW_ID, lock: { reason: 'marquee' } });
  const record = tournamentEngine.getTournament().tournamentRecord;

  // display settings that withhold the court
  const publishStatus = {
    displaySettings: { draws: { default: { scheduleDetails: [{ attributes: { courtId: false } }] } } },
  };
  const params = eventParams(record);
  const scheduleOf = (matchUps) => matchUps.find((m) => m.matchUpId === matchUpId)?.schedule;

  const operational: any = allDrawMatchUps(params);
  expect(scheduleOf(operational.matchUps).lock).toBeDefined();
  expect(scheduleOf(operational.matchUps).courtId).toBeDefined();

  const groupedDraw: any = drawMatchUps({ ...params, usePublishState: true, publishStatus });
  const expected = scheduleOf([...groupedDraw.upcomingMatchUps, ...groupedDraw.pendingMatchUps]);
  expect(expected.lock).toBeUndefined();
  expect(expected.courtId).toBeUndefined();
  expect(expected.scheduledTime).toBeDefined();

  const allDraw: any = allDrawMatchUps({ ...params, usePublishState: true, publishStatus });
  expect(scheduleOf(allDraw.matchUps)).toEqual(expected);

  const allEvent: any = allEventMatchUps({ ...params, usePublishState: true, publishStatus });
  expect(scheduleOf(allEvent.matchUps)).toEqual(expected);

  // and through the engine, which is how the public API reaches allDrawMatchUps
  const viaEngine = tournamentEngine.allDrawMatchUps({
    drawId: DRAW_ID,
    usePublishState: true,
    inContext: true,
    publishStatus,
  });
  expect(scheduleOf(viaEngine.matchUps)).toEqual(expected);
});

test('an embargoed round is withheld by every query under usePublishState, not only eventMatchUps', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  const { matchUpId } = scheduledTournament();
  const record = tournamentEngine.getTournament().tournamentRecord;
  const structureId = eventParams(record).drawDefinition.structures[0].structureId;

  tournamentEngine.publishEvent({
    drawDetails: {
      [DRAW_ID]: {
        structureDetails: {
          [structureId]: {
            published: true,
            scheduledRounds: { 1: { published: true, embargo: '2026-06-21T00:00:00Z' } },
          },
        },
      },
    },
    eventId: EVENT_ID,
  });

  const scheduleOf = (matchUps) => matchUps.find((m) => m.matchUpId === matchUpId)?.schedule;
  const grouped = (result) => [...result.upcomingMatchUps, ...result.pendingMatchUps];
  const published = { usePublishState: true, inContext: true, eventId: EVENT_ID, drawId: DRAW_ID };

  const expected = scheduleOf(grouped(tournamentEngine.eventMatchUps(published)));
  // the embargo keeps the date and withholds the time and the court
  expect(expected).toEqual({ scheduledDate: SCHEDULED_DATE });

  expect(scheduleOf(tournamentEngine.allEventMatchUps(published).matchUps)).toEqual(expected);
  expect(scheduleOf(tournamentEngine.allDrawMatchUps(published).matchUps)).toEqual(expected);
  expect(scheduleOf(grouped(tournamentEngine.drawMatchUps(published)))).toEqual(expected);
  expect(scheduleOf(tournamentEngine.allTournamentMatchUps({ usePublishState: true }).matchUps)).toEqual(expected);

  // the operational view is untouched
  expect(
    scheduleOf(tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps).courtId,
  ).toBeDefined();
});
