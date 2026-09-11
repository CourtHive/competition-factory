import { getScheduleProjection } from '@Query/facilitySchedule/getScheduleProjection';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

const venueProfiles = [
  {
    venueId: 'v1',
    venueName: 'Club Courts',
    venueAbbreviation: 'CLB',
    startTime: '08:00',
    endTime: '20:00',
    courtsCount: 3,
    idPrefix: 'v1c',
  },
  {
    venueId: 'v2',
    venueName: 'City Courts',
    venueAbbreviation: 'CTY',
    startTime: '08:00',
    endTime: '20:00',
    courtsCount: 3,
    idPrefix: 'v2c',
  },
];

const scheduledDate = '2025-01-01';

// generate one tournament, two venues, and place three matchUps (two on v1, one on v2)
function setupScheduled() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 't1' },
    startDate: '2025-01-01',
    endDate: '2025-01-07',
    drawProfiles: [{ drawSize: 8, eventName: 'E1' }],
    venueProfiles,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const { venues } = tournamentEngine.getVenuesAndCourts();
  const v1 = venues.find((venue: any) => venue.venueId === 'v1');
  const v2 = venues.find((venue: any) => venue.venueId === 'v2');
  const v1Court0 = v1.courts[0].courtId;
  const v1Court1 = v1.courts[1].courtId;
  const v2Court0 = v2.courts[0].courtId;

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const [m0, m1, m2] = matchUps;

  tournamentEngine.addMatchUpScheduleItems({
    matchUpId: m0.matchUpId,
    drawId,
    schedule: { scheduledDate, scheduledTime: '09:00', courtId: v1Court0, courtOrder: 1 },
  });
  tournamentEngine.addMatchUpScheduleItems({
    matchUpId: m1.matchUpId,
    drawId,
    schedule: { scheduledDate, scheduledTime: '10:00', courtId: v1Court1, courtOrder: 1 },
  });
  tournamentEngine.addMatchUpScheduleItems({
    matchUpId: m2.matchUpId,
    drawId,
    schedule: { scheduledDate, scheduledTime: '09:00', courtId: v2Court0, courtOrder: 1 },
  });

  const { tournamentRecord: updated } = tournamentEngine.getTournament();
  return { tournamentRecord: updated, ids: { m0: m0.matchUpId, m1: m1.matchUpId, m2: m2.matchUpId }, v1Court0 };
}

describe('getScheduleProjection', () => {
  it('projects only placed matchUps into slim schedule cells', () => {
    const { tournamentRecord, ids, v1Court0 } = setupScheduled();

    const { scheduleCells } = getScheduleProjection({ tournamentRecord });

    // three scheduled; the remaining four matchUps of the drawSize-8 draw are excluded
    expect(scheduleCells).toHaveLength(3);

    const cell0 = scheduleCells!.find((cell) => cell.matchUpId === ids.m0)!;
    expect(cell0.courtId).toEqual(v1Court0);
    expect(cell0.venueId).toEqual('v1');
    expect(cell0.scheduledDate).toEqual(scheduledDate);
    expect(cell0.scheduledTime).toEqual('09:00');
    expect(cell0.courtOrder).toEqual(1);
    expect(cell0.tournamentId).toEqual('t1');
    expect(Array.isArray(cell0.labels)).toEqual(true);
  });

  it('resolves venueId from the court that owns it', () => {
    const { tournamentRecord } = setupScheduled();
    const { scheduleCells } = getScheduleProjection({ tournamentRecord });
    // every cell resolves to the venue that actually owns its court
    for (const cell of scheduleCells!) {
      expect(['v1', 'v2']).toContain(cell.venueId);
    }
    expect(scheduleCells!.filter((cell) => cell.venueId === 'v1')).toHaveLength(2);
    expect(scheduleCells!.filter((cell) => cell.venueId === 'v2')).toHaveLength(1);
  });

  it('filters to the requested venueIds', () => {
    const { tournamentRecord } = setupScheduled();

    const onlyV1 = getScheduleProjection({ tournamentRecord, venueIds: ['v1'] }).scheduleCells!;
    expect(onlyV1).toHaveLength(2);
    expect(onlyV1.every((cell) => cell.venueId === 'v1')).toEqual(true);

    const onlyV2 = getScheduleProjection({ tournamentRecord, venueIds: ['v2'] }).scheduleCells!;
    expect(onlyV2).toHaveLength(1);
    expect(onlyV2[0].venueId).toEqual('v2');

    const none = getScheduleProjection({ tournamentRecord, venueIds: ['does-not-exist'] }).scheduleCells!;
    expect(none).toHaveLength(0);
  });

  it('projects a placed matchUp that has no assigned participants (empty labels)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 't-tbp' },
      startDate: '2025-01-01',
      endDate: '2025-01-07',
      drawProfiles: [{ drawSize: 8, eventName: 'E1' }],
      venueProfiles,
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    // a later-round matchUp with no participants assigned yet
    const toBePlayed = matchUps.find((matchUp: any) => !matchUp.sides?.some((side: any) => side?.participant));
    expect(toBePlayed).not.toBeUndefined();

    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: toBePlayed.matchUpId,
      drawId,
      schedule: { scheduledDate, scheduledTime: '12:00' },
    });

    const { tournamentRecord: updated } = tournamentEngine.getTournament();
    const cell = getScheduleProjection({ tournamentRecord: updated }).scheduleCells!.find(
      (entry) => entry.matchUpId === toBePlayed.matchUpId,
    )!;
    expect(cell).not.toBeUndefined();
    expect(cell.labels).toEqual([]);
    // scheduled by date but not assigned a court → venueId unresolved
    expect(cell.courtId).toBeUndefined();
  });

  it('returns an empty projection when nothing is scheduled', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 't-empty' },
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles,
      nonRandom: 1,
    });
    const { scheduleCells } = getScheduleProjection({ tournamentRecord });
    expect(scheduleCells).toEqual([]);
  });

  it('errors when tournamentRecord is missing', () => {
    const result = getScheduleProjection({});
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    expect(result.scheduleCells).toBeUndefined();
  });

  it('errors (does not throw) when called with no arguments', () => {
    const result = getScheduleProjection(undefined as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });
});
