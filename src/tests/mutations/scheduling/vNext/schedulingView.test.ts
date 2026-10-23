import { getScheduledRoundsDetails } from '@Query/matchUps/scheduling/getScheduledRoundsDetails';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { FEED_IN_CHAMPIONSHIP, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

// vNext's view must resolve a scheduling profile exactly as v1 does: per date and venue the same matchUps in the same
// order (v1: getScheduledRoundsDetails, then the first venue to profile a matchUp on a date claims it), and the same
// minutes for each (v1's minutesMap).

const DAYS = ['2026-10-01', '2026-10-02'];

function setup(drawProfiles: any[], outcomes = false) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [1, 2].map((n) => ({ venueId: `venue-${n}`, courtsCount: 4, startTime: '08:00', endTime: '20:00' })),
    drawProfiles: outcomes
      ? drawProfiles.map((profile) => ({
          ...profile,
          outcomes: [1, 2].map((roundPosition) => ({
            roundNumber: 1,
            roundPosition,
            scoreString: '6-1 6-1',
            winningSide: 1,
          })),
        }))
      : drawProfiles,
    startDate: DAYS[0],
    endDate: DAYS[1],
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const draws = tournamentRecord.events.map((event: any) => ({
    eventId: event.eventId,
    drawId: event.drawDefinitions[0].drawId,
    structures: event.drawDefinitions[0].structures,
  }));
  const round = (drawIndex: number, structureIndex: number, roundNumber: number, extra: any = {}) => ({
    structureId: draws[drawIndex].structures[structureIndex].structureId,
    tournamentId: tournamentRecord.tournamentId,
    eventId: draws[drawIndex].eventId,
    drawId: draws[drawIndex].drawId,
    roundNumber,
    ...extra,
  });
  return { round };
}

/** v1's per-venue matchUps and minutes for a profile, as getVenueSchedulingDetails derives them */
function v1Plan(tournamentRecords: any, schedulingProfile: any[], scheduleCompletedMatchUps?: boolean) {
  // the matchUps scheduleProfileRounds hands its scheduler
  const matchUps = allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
    afterRecoveryTimes: true,
    nextMatchUps: true,
    tournamentRecords,
  }).matchUps;
  const minutes: Record<string, any> = {};
  const plan = schedulingProfile.map(({ scheduleDate, venues }) => {
    const claimed = new Set<string>();
    return {
      scheduleDate,
      venues: venues.map(({ venueId, rounds }) => {
        const result: any = getScheduledRoundsDetails({
          tournamentRecords,
          rounds,
          scheduleCompletedMatchUps,
          matchUps,
        });
        Object.assign(minutes, result.minutesMap);
        const matchUpIds = (result.orderedMatchUpIds ?? []).filter((id: string) => !claimed.has(id));
        matchUpIds.forEach((id: string) => claimed.add(id));
        return { venueId, matchUpIds };
      }),
    };
  });
  return { plan, minutes };
}

function vNextPlan(view: any) {
  const plan = view.dates.map(({ scheduleDate, venues }) => ({
    scheduleDate,
    venues: venues.map(({ venueId, rounds }) => ({ venueId, matchUpIds: rounds.flatMap((r: any) => r.matchUpIds) })),
  }));
  return { plan, minutes: Object.fromEntries(view.minutes) };
}

/** the engine's records as they stand now: getTournament returns a copy, so a copy taken earlier misses later writes */
function currentRecords() {
  const { tournamentRecord } = tournamentEngine.getTournament();
  return { [tournamentRecord.tournamentId]: tournamentRecord };
}

function expectSamePlan(schedulingProfile: any[], scheduleCompletedMatchUps?: boolean) {
  const result: any = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);
  const tournamentRecords = currentRecords();
  const view: any = buildSchedulingView({ tournamentRecords, scheduleCompletedMatchUps });
  expect(view.error).toBeUndefined();
  const expected = v1Plan(tournamentRecords, schedulingProfile, scheduleCompletedMatchUps);
  const actual = vNextPlan(view);
  expect(actual.plan).toEqual(expected.plan);
  expect(actual.minutes).toEqual(expected.minutes);
  // the comparison is over something
  expect(actual.plan.flatMap((d: any) => d.venues.flatMap((v: any) => v.matchUpIds)).length).toBeGreaterThan(0);
}

describe('the vNext view resolves a profile as v1 does', () => {
  it('single elimination over two days and two venues, one round profiled at both venues', () => {
    const { round } = setup([{ drawSize: 32 }]);
    expectSamePlan([
      {
        scheduleDate: DAYS[0],
        venues: [
          { venueId: 'venue-1', rounds: [round(0, 0, 1), round(0, 0, 2)] },
          { venueId: 'venue-2', rounds: [round(0, 0, 2)] },
        ],
      },
      { scheduleDate: DAYS[1], venues: [{ venueId: 'venue-1', rounds: [round(0, 0, 3), round(0, 0, 4)] }] },
    ]);
  });

  it('a feed-in championship with its consolation, and a round robin profiled on its container', () => {
    const { round } = setup([
      { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      { drawSize: 8, drawType: ROUND_ROBIN },
    ]);
    expectSamePlan([
      {
        scheduleDate: DAYS[0],
        venues: [
          { venueId: 'venue-1', rounds: [round(0, 0, 1), round(0, 1, 1), round(0, 1, 2)] },
          { venueId: 'venue-2', rounds: [round(1, 0, 1), round(1, 0, 2), round(1, 0, 3)] },
        ],
      },
    ]);
  });

  it('round segments, a round limited to matchUpIds, and rounds ordered by sortOrder', () => {
    const { round } = setup([{ drawSize: 32 }]);
    const r1 = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
      .matchUps.map((m: any) => m.matchUpId);
    expectSamePlan([
      {
        scheduleDate: DAYS[0],
        venues: [
          {
            venueId: 'venue-1',
            rounds: [
              round(0, 0, 2, { sortOrder: 2 }),
              round(0, 0, 1, { roundSegment: { segmentNumber: 1, segmentsCount: 2 }, sortOrder: 1 }),
            ],
          },
          {
            venueId: 'venue-2',
            rounds: [round(0, 0, 1, { roundSegment: { segmentNumber: 2, segmentsCount: 2 } })],
          },
        ],
      },
      {
        scheduleDate: DAYS[1],
        venues: [{ venueId: 'venue-1', rounds: [round(0, 0, 1, { matchUpIds: r1.slice(0, 3) })] }],
      },
    ]);
  });

  it('completed matchUps are left out, unless scheduleCompletedMatchUps', () => {
    const { round } = setup([{ drawSize: 8 }], true);
    const profile = [
      { scheduleDate: DAYS[0], venues: [{ venueId: 'venue-1', rounds: [round(0, 0, 1), round(0, 0, 2)] }] },
    ];
    expectSamePlan(profile);
    expectSamePlan(profile, true);
  });

  it('a round none of whose matchUps has a format schedules nothing, and is reported', () => {
    const { round } = setup([{ drawSize: 8 }, { drawSize: 8 }]);
    // strip every format the first draw's matchUps could inherit: tournament, event, draw, structures, matchUps
    const { tournamentRecord } = tournamentEngine.getTournament();
    const strip = (item: any) => delete item.matchUpFormat;
    strip(tournamentRecord);
    const [event] = tournamentRecord.events;
    strip(event);
    for (const drawDefinition of event.drawDefinitions) {
      strip(drawDefinition);
      for (const structure of drawDefinition.structures) {
        strip(structure);
        structure.matchUps.forEach(strip);
      }
    }
    tournamentEngine.setState(tournamentRecord);
    const profile = [
      { scheduleDate: DAYS[0], venues: [{ venueId: 'venue-1', rounds: [round(0, 0, 1), round(1, 0, 1)] }] },
    ];
    expectSamePlan(profile);
    const view: any = buildSchedulingView({ tournamentRecords: currentRecords() });
    const [unformatted, formatted] = view.dates[0].venues[0].rounds;
    expect(unformatted.minutes).toBeUndefined();
    expect(unformatted.matchUpIds).toEqual([]);
    expect(unformatted.noFormatMatchUpIds.length).toEqual(4);
    expect(formatted.matchUpIds.length).toEqual(4);
    expect(formatted.noFormatMatchUpIds).toBeUndefined();

    // a run places the formatted round and reports the other (CA 2026-10-23: report it)
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[0]] });
    expect(result.scheduledMatchUpIds[DAYS[0]].length).toEqual(4);
    expect(result.noFormatMatchUpIds[DAYS[0]].toSorted()).toEqual(unformatted.noFormatMatchUpIds.toSorted());
  });

  it('a profile with no date left after scheduleDates is refused', () => {
    const { round } = setup([{ drawSize: 8 }]);
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: DAYS[0], venues: [{ venueId: 'venue-1', rounds: [round(0, 0, 1)] }] }],
    });
    const view: any = buildSchedulingView({ tournamentRecords: currentRecords(), scheduleDates: [DAYS[1]] });
    expect(view.error).toEqual(NO_VALID_DATES);
  });
});
