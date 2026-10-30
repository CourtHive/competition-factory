import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { getEventData } from '@Query/event/getEventData';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, expectTypeOf, it } from 'vitest';

// constants and types
import { PayloadProfileEnum } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import type {
  CompetitionScheduleMatchUpsResult,
  CourtData,
  DrawData,
  EventData,
  EventDataResult,
  EventInfo,
  ScheduleRow,
  StructureData,
  TournamentInfo,
  VenueData,
} from '@Types/viewTypes';

type IsAny<T> = 0 extends 1 & T ? true : false;

describe('view result types', () => {
  it('declares named result types that survive the context-exclusion wrapper and the engine', () => {
    expectTypeOf(getEventData).returns.toEqualTypeOf<EventDataResult>();
    expectTypeOf(competitionScheduleMatchUps).returns.toEqualTypeOf<CompetitionScheduleMatchUpsResult>();
    expectTypeOf<ReturnType<typeof tournamentEngine.getEventData>>().toEqualTypeOf<EventDataResult>();

    expectTypeOf<EventDataResult['eventData']>().toEqualTypeOf<EventData | undefined>();
    expectTypeOf<EventData['eventInfo']>().toEqualTypeOf<EventInfo>();
    expectTypeOf<EventData['tournamentInfo']>().toEqualTypeOf<TournamentInfo | undefined>();
    expectTypeOf<EventData['venuesData']>().toEqualTypeOf<VenueData[]>();
    expectTypeOf<EventData['drawsData']>().toEqualTypeOf<DrawData[] | undefined>();
    expectTypeOf<DrawData['structures']>().toEqualTypeOf<StructureData[] | undefined>();
    expectTypeOf<CompetitionScheduleMatchUpsResult['courtsData']>().toEqualTypeOf<CourtData[] | undefined>();
    expectTypeOf<CompetitionScheduleMatchUpsResult['rows']>().toEqualTypeOf<ScheduleRow[] | undefined>();
    expectTypeOf<CourtData['matchUps']>().toEqualTypeOf<HydratedMatchUp[]>();

    expectTypeOf<IsAny<EventData['drawsData']>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<EventInfo['eventId']>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<TournamentInfo['tournamentId']>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<StructureData['structureId']>>().toEqualTypeOf<false>();
  });

  it('returns the typed fields on a generated tournament', () => {
    const startDate = '2026-10-30';
    const venueId = 'venue-1';
    const drawId = 'draw-1';
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId, courtsCount: 3, venueName: 'Main Venue', startTime: '08:00', endTime: '20:00' }],
      schedulingProfile: [{ scheduleDate: startDate, venues: [{ venueId, rounds: [{ drawId, roundNumber: 1 }] }] }],
      drawProfiles: [{ drawId, drawSize: 8 }],
      autoSchedule: true,
      endDate: startDate,
      startDate,
    });

    const result = getEventData({ tournamentRecord, eventId });
    expect(result.success).toEqual(true);
    const eventData = result.eventData;
    const eventIdValue: string | undefined = eventData?.eventInfo.eventId;
    expect(eventIdValue).toEqual(eventId);
    const tournamentId: string | undefined = eventData?.tournamentInfo?.tournamentId;
    expect(tournamentId).toEqual(tournamentRecord.tournamentId);
    const venue: VenueData | undefined = eventData?.venuesData[0];
    expect(venue?.venueId).toEqual(venueId);
    expect(venue?.courtsInfo.length).toEqual(3);
    const draw = eventData?.drawsData?.[0];
    expect(draw?.drawGenerated).toEqual(true);
    const structure = draw?.structures?.[0];
    expect(typeof structure?.structureId).toEqual('string');
    expect(structure?.structureCompleted).toEqual(false);
    const firstRound = structure?.roundMatchUps?.[1] ?? [];
    expect(firstRound.length).toEqual(4);
    expect(firstRound[0].eventId).toEqual(eventId);

    const stubs = getEventData({ tournamentRecord, eventId, drawsProfile: PayloadProfileEnum.STUBS });
    const stub = stubs.eventData?.drawsData?.[0];
    expect(stub?.drawGenerated).toEqual(true);
    expect(stub?.structures).toBeUndefined();

    const schedule = competitionScheduleMatchUps({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
      matchUpFilters: { scheduledDate: startDate },
      withCourtGridRows: true,
    });
    expect(schedule.success).toEqual(true);
    const courts: CourtData[] = schedule.courtsData ?? [];
    expect(courts.length).toEqual(3);
    expect(courts.every((court) => court.venueId === venueId)).toEqual(true);
    // scheduled by time, not to a court: every court is listed, and none holds a matchUp yet
    expect(courts.flatMap((court) => court.matchUps)).toEqual([]);
    const dateMatchUps: HydratedMatchUp[] = schedule.dateMatchUps ?? [];
    expect(dateMatchUps.length).toBeGreaterThan(0);
    expect(dateMatchUps[0].schedule?.venueId).toEqual(venueId);
    const rows: ScheduleRow[] = schedule.rows ?? [];
    expect(rows[0].rowId).toEqual('rowId-1');
    expect(schedule.courtPrefix).toEqual('C|');
  });
});
