import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import {
  ENTRY_STATUS_REPORT,
  PARTICIPANT_STATS_REPORT,
  STRUCTURE_REPORT,
  VENUE_UTILIZATION_REPORT,
} from '@Constants/reportConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

describe('getAvailableReports', () => {
  it('returns all registered reports', () => {
    const drawProfiles = [{ drawSize: 8 }];
    const venueProfiles = [{ courtsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getAvailableReports();
    expect(result.availableReports.length).toBeGreaterThanOrEqual(9);

    const reportIds = result.availableReports.map((r: any) => r.reportId);
    expect(reportIds).toContain(ENTRY_STATUS_REPORT);
    expect(reportIds).toContain(STRUCTURE_REPORT);
    expect(reportIds).toContain(PARTICIPANT_STATS_REPORT);
    expect(reportIds).toContain(VENUE_UTILIZATION_REPORT);
  });

  it('each report has name, description, and category', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    let result: any = tournamentEngine.getAvailableReports();
    for (const report of result.availableReports) {
      expect(report.reportId).toBeTruthy();
      expect(report.name).toBeTruthy();
      expect(report.description).toBeTruthy();
      expect(report.category).toBeTruthy();
    }
  });

  it('marks entry status and structure as computable when events exist', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getAvailableReports();
    const entryReport = result.availableReports.find((r: any) => r.reportId === ENTRY_STATUS_REPORT);
    const structureReport = result.availableReports.find((r: any) => r.reportId === STRUCTURE_REPORT);
    expect(entryReport.computableNow).toBe(true);
    expect(structureReport.computableNow).toBe(true);
  });

  it('marks venues report as not computable when no venues', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getAvailableReports();
    const venuesReport = result.availableReports.find((r: any) => r.reportId === VENUE_UTILIZATION_REPORT);
    expect(venuesReport.computableNow).toBe(false);
  });

  it('marks venues report as computable when venues exist', () => {
    const drawProfiles = [{ drawSize: 8 }];
    const venueProfiles = [{ courtsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getAvailableReports();
    const venuesReport = result.availableReports.find((r: any) => r.reportId === VENUE_UTILIZATION_REPORT);
    expect(venuesReport.computableNow).toBe(true);
  });

  it('marks participant stats as not computable when no team participants', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getAvailableReports();
    const statsReport = result.availableReports.find((r: any) => r.reportId === PARTICIPANT_STATS_REPORT);
    expect(statsReport.computableNow).toBe(false);
  });

  it('marks participant stats as computable with team participants', () => {
    const drawProfiles = [{ drawSize: 4, eventType: TEAM_EVENT }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getAvailableReports();
    const statsReport = result.availableReports.find((r: any) => r.reportId === PARTICIPANT_STATS_REPORT);
    expect(statsReport.computableNow).toBe(true);
  });
});
