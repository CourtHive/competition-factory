import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

describe('getVenuesReport', () => {
  it('returns venue utilization for tournament with venues and scheduled matchUps', () => {
    const drawProfiles = [{ drawSize: 8 }];
    const venueProfiles = [{ courtsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      autoSchedule: true,
      drawProfiles,
      venueProfiles,
      setState: true,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };

    let result: any = tournamentEngine.getVenuesReport({ tournamentRecords });
    expect(result.venuesReport).toBeTruthy();
    expect(result.venuesReport.length).toBeGreaterThan(0);

    const venue = result.venuesReport[0];
    expect(venue.venueId).toBeTruthy();
    expect(venue.venueName).toBeTruthy();
    expect(venue.venueReport).toBeTruthy();

    const dates = Object.keys(venue.venueReport);
    expect(dates.length).toBeGreaterThan(0);

    const dateReport = venue.venueReport[dates[0]];
    expect(dateReport).toHaveProperty('scheduledMatchUpsCount');
    expect(dateReport).toHaveProperty('availableCourts');
    expect(dateReport).toHaveProperty('availableMinutes');
    expect(dateReport).toHaveProperty('scheduledMinutes');
    expect(dateReport).toHaveProperty('percentUtilization');
  });

  it('returns empty report when no venues', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };

    let result: any = tournamentEngine.getVenuesReport({ tournamentRecords });
    expect(result.venuesReport).toBeTruthy();
    expect(result.venuesReport.length).toBe(0);
  });

  it('returns error with invalid dates', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };

    let result: any = tournamentEngine.getVenuesReport({ tournamentRecords, dates: ['not-a-date'] });
    expect(result.error).toBeTruthy();
  });
});
