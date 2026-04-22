import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

describe('buildReportContext', () => {
  it('returns context with participantMap and matchUps', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.buildReportContext();
    expect(result.tournamentRecord).toBeTruthy();
    expect(result.participantMap).toBeTruthy();
    expect(Object.keys(result.participantMap).length).toBeGreaterThan(0);
    expect(Array.isArray(result.matchUps)).toBe(true);
    expect(result.matchUps.length).toBeGreaterThan(0);
  });

  it('includes venues when tournament has venues', () => {
    const drawProfiles = [{ drawSize: 8 }];
    const venueProfiles = [{ courtsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.buildReportContext();
    expect(Array.isArray(result.venues)).toBe(true);
    expect(result.venues.length).toBeGreaterThan(0);
  });

  it('returns empty venues array when tournament has no venues', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.buildReportContext();
    expect(Array.isArray(result.venues)).toBe(true);
    expect(result.venues.length).toBe(0);
  });

  it('returns error when no tournamentRecord', () => {
    tournamentEngine.reset();
    let result: any = tournamentEngine.buildReportContext();
    expect(result.error).toBeTruthy();
  });
});
