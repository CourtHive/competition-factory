import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import {
  COMPETITIVENESS_REPORT,
  ENTRY_STATUS_REPORT,
  MATCH_RESULTS_REPORT,
  MATCHUP_STATUS_REPORT,
  PARTICIPANT_RESULTS_REPORT,
  PARTICIPANT_STATS_REPORT,
  SEEDING_PERFORMANCE_REPORT,
  STRUCTURE_REPORT,
  VENUE_UTILIZATION_REPORT,
} from '@Constants/reportConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

describe('generateReport', () => {
  it('generates entry status report with unified shape', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    const venueProfiles = [{ courtsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      venueProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: ENTRY_STATUS_REPORT });
    expect(result.reportId).toBe(ENTRY_STATUS_REPORT);
    expect(result.generatedAt).toBeTruthy();
    expect(Array.isArray(result.columns)).toBe(true);
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.columns[0]).toHaveProperty('key');
    expect(result.columns[0]).toHaveProperty('title');
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
  });

  it('generates structure report with unified shape', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: STRUCTURE_REPORT });
    expect(result.reportId).toBe(STRUCTURE_REPORT);
    expect(result.generatedAt).toBeTruthy();
    expect(Array.isArray(result.columns)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);

    const row = result.rows[0];
    expect(row).toHaveProperty('eventName');
    expect(row).toHaveProperty('drawName');
    expect(row).toHaveProperty('stage');
  });

  it('generates venue utilization report with unified shape', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    const venueProfiles = [{ courtsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      autoSchedule: true,
      drawProfiles,
      venueProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: VENUE_UTILIZATION_REPORT });
    expect(result.reportId).toBe(VENUE_UTILIZATION_REPORT);
    expect(Array.isArray(result.columns)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it('generates participant stats report with unified shape', () => {
    const drawProfiles = [{ drawSize: 4, eventType: TEAM_EVENT }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      randomWinningSide: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: PARTICIPANT_STATS_REPORT });
    expect(result.reportId).toBe(PARTICIPANT_STATS_REPORT);
    expect(Array.isArray(result.columns)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it('returns error for unknown reportId', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    let result: any = tournamentEngine.generateReport({ reportId: 'nonexistent.report' });
    expect(result.error).toBeTruthy();
  });

  it('returns error when no tournamentRecord', () => {
    tournamentEngine.reset();
    let result: any = tournamentEngine.generateReport({ reportId: ENTRY_STATUS_REPORT });
    expect(result.error).toBeTruthy();
  });

  it('generates match results report', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: MATCH_RESULTS_REPORT });
    expect(result.reportId).toBe(MATCH_RESULTS_REPORT);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('roundName');
    expect(result.rows[0]).toHaveProperty('side1');
    expect(result.rows[0]).toHaveProperty('score');
    expect(result.rows[0]).toHaveProperty('winnerName');
  });

  it('generates matchUp status summary report', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: MATCHUP_STATUS_REPORT });
    expect(result.reportId).toBe(MATCHUP_STATUS_REPORT);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('eventName');
    expect(result.rows[0]).toHaveProperty('status');
    expect(result.rows[0]).toHaveProperty('count');
  });

  it('generates competitiveness report', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: COMPETITIVENESS_REPORT });
    expect(result.reportId).toBe(COMPETITIVENESS_REPORT);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('competitiveness');
  });

  it('competitiveness report renders walkover rows with empty Spread % (not NaN)', async () => {
    const { ROUND_ROBIN } = await import('@Constants/drawDefinitionConstants');
    const { SINGLES } = await import('@Constants/eventConstants');
    const { WALKOVER, DEFAULTED } = await import('@Constants/matchUpStatusConstants');

    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          eventType: SINGLES,
          outcomes: [
            { drawPositions: [1, 2], matchUpStatus: WALKOVER, winningSide: 1 },
            { drawPositions: [1, 3], scoreString: '6-3 6-3', winningSide: 1 },
            { drawPositions: [1, 4], scoreString: '6-2 6-2', winningSide: 1 },
            { drawPositions: [2, 3], matchUpStatus: DEFAULTED, winningSide: 2 },
            { drawPositions: [2, 4], scoreString: '6-1 6-1', winningSide: 2 },
            { drawPositions: [3, 4], scoreString: '6-0 6-0', winningSide: 1 },
          ],
        },
      ],
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: COMPETITIVENESS_REPORT });
    expect(result.reportId).toBe(COMPETITIVENESS_REPORT);

    const walkoverRow = result.rows.find((r: any) => r.competitiveness === 'WALKOVER');
    expect(walkoverRow).toBeDefined();
    expect(walkoverRow.pctSpread).toEqual('');
    expect(Number.isNaN(walkoverRow.pctSpread)).toEqual(false);

    const playedRow = result.rows.find((r: any) => r.competitiveness !== 'WALKOVER');
    expect(playedRow).toBeDefined();
    expect(typeof playedRow.pctSpread).toEqual('number');
    expect(Number.isFinite(playedRow.pctSpread)).toEqual(true);
  });

  it('generates participant results report', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: PARTICIPANT_RESULTS_REPORT });
    expect(result.reportId).toBe(PARTICIPANT_RESULTS_REPORT);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('participantName');
    expect(result.rows[0]).toHaveProperty('wins');
    expect(result.rows[0]).toHaveProperty('losses');
    expect(result.rows[0]).toHaveProperty('winPct');
  });

  it('generates seeding performance report', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: SEEDING_PERFORMANCE_REPORT });
    expect(result.reportId).toBe(SEEDING_PERFORMANCE_REPORT);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('seedValue');
    expect(result.rows[0]).toHaveProperty('finishingPosition');
    expect(result.rows[0]).toHaveProperty('performance');
    // seedValue and expectedPosition must be scalars, not the seed assignment object
    for (const row of result.rows) {
      expect(typeof row.seedValue).not.toBe('object');
      expect(['number', 'string']).toContain(typeof row.seedValue);
      expect(row.expectedPosition).not.toBe('[object Object]');
    }
  });

  it('every column key exists in each row', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.generateReport({ reportId: ENTRY_STATUS_REPORT });
    const columnKeys = result.columns.map((c: any) => c.key);
    for (const row of result.rows) {
      for (const key of columnKeys) {
        expect(row).toHaveProperty(key);
      }
    }
  });
});
