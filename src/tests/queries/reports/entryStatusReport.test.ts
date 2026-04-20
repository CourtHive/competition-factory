import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { DOUBLES_EVENT } from '@Constants/eventConstants';

describe('getEntryStatusReports', () => {
  it('returns entry reports for a tournament with events', () => {
    const drawProfiles = [{ drawSize: 8, seedsCount: 2 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getEntryStatusReports();
    expect(result.participantEntryReports).toBeTruthy();
    expect(result.participantEntryReports.length).toBeGreaterThan(0);
    expect(result.entryStatusReports).toBeTruthy();
    expect(result.eventReports).toBeTruthy();
    expect(result.tournamentEntryReport).toBeTruthy();
    expect(result.tournamentEntryReport.drawDefinitionsCount).toBeGreaterThan(0);
  });

  it('returns empty reports for tournament with no events', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    let result: any = tournamentEngine.getEntryStatusReports();
    expect(result.participantEntryReports).toHaveLength(0);
    expect(result.entryStatusReports).toHaveLength(0);
    expect(result.tournamentEntryReport.drawDefinitionsCount).toBe(0);
  });

  it('includes individual participants for doubles events', () => {
    const drawProfiles = [{ drawSize: 8, eventType: DOUBLES_EVENT }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getEntryStatusReports();
    expect(result.participantEntryReports.length).toBeGreaterThan(0);
  });

  it('participant entry reports contain required fields', () => {
    const drawProfiles = [{ drawSize: 8 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getEntryStatusReports();
    const entry = result.participantEntryReports[0];
    expect(entry).toHaveProperty('participantId');
    expect(entry).toHaveProperty('eventId');
    expect(entry).toHaveProperty('entryStatus');
    expect(entry).toHaveProperty('entryStage');
    expect(entry).toHaveProperty('drawId');
  });

  it('tournament entry report includes participant counts', () => {
    const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    let result: any = tournamentEngine.getEntryStatusReports();
    const report = result.tournamentEntryReport;
    expect(report.individualParticipantsCount).toBeGreaterThan(0);
    expect(typeof report.nonParticipatingEntriesCount).toBe('number');
  });
});
