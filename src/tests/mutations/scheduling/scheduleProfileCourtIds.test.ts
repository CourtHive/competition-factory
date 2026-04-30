import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

const startDate = '2024-06-15';
const endDate = '2024-06-16';

describe('scheduleProfile courtIds filter', () => {
  it('scheduleProfileGrid only places matchUps on courts in courtIds', () => {
    const venueId = 'venue-1';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [{ drawSize: 16 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { courts } = tournamentEngine.getVenuesAndCourts();
    const allCourtIds = courts.map((c: any) => c.courtId);
    const targetCourtIds = allCourtIds.slice(0, 2);
    const otherCourtIds = new Set(allCourtIds.slice(2));

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
        },
      ],
    });

    result = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      courtIds: targetCourtIds,
    });
    expect(result.success).toEqual(true);

    const { matchUps: after } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const placedOnDay = after.filter((m: any) => m.schedule?.scheduledDate === startDate && m.schedule?.courtId);
    expect(placedOnDay.length).toBeGreaterThan(0);
    expect(placedOnDay.every((m: any) => !otherCourtIds.has(m.schedule.courtId))).toEqual(true);
  });

  it('scheduleProfileGrid with empty courtIds places nothing', () => {
    const venueId = 'venue-empty';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'V', venueAbbreviation: 'V', courtsCount: 2, venueId }],
      drawProfiles: [{ drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
        },
      ],
    });

    result = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      courtIds: [],
    });
    expect(result.success).toEqual(true);

    const { matchUps: after } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const placed = after.filter((m: any) => m.schedule?.courtId);
    expect(placed.length).toEqual(0);
  });

  it('scheduleProfileRounds only assigns times on courts in courtIds', () => {
    const profileStart = '2022-01-01';
    const profileEnd = '2022-01-07';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'venueId1', courtsCount: 8, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawId: 'drawId1', drawSize: 32 }],
      startDate: profileStart,
      endDate: profileEnd,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { courts } = tournamentEngine.getVenuesAndCourts();
    const allCourtIds = courts.map((c: any) => c.courtId);
    const targetCourtIds = allCourtIds.slice(0, 4);
    const otherCourtIds = new Set(allCourtIds.slice(4));

    const { rounds } = tournamentEngine.getRounds();
    const drawRounds = rounds.filter(({ drawId }: any) => drawId === 'drawId1');

    result = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: profileStart,
          venues: [{ venueId: 'venueId1', rounds: drawRounds }],
        },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.scheduleProfileRounds({ courtIds: targetCourtIds, pro: true });
    expect(result.success).toEqual(true);

    const { matchUps: after } = tournamentEngine.allCompetitionMatchUps();
    const scheduledWithCourt = after.filter((m: any) => m.schedule?.courtId);
    expect(scheduledWithCourt.length).toBeGreaterThan(0);
    expect(scheduledWithCourt.every((m: any) => !otherCourtIds.has(m.schedule.courtId))).toEqual(true);
  });
});
