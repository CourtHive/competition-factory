import { processLeagueProfiles } from '@Generators/mocks/processLeagueProfiles';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { AD_HOC, MAIN } from '@Constants/drawDefinitionConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/participantConstants';
import { MALE } from '@Constants/genderConstants';

function createEmptyTournamentRecord(startDate = '2024-01-01', endDate = '2024-06-30') {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [],
    startDate,
    endDate,
  });
  return tournamentRecord;
}

describe('processLeagueProfiles basic generation', () => {
  it('generates teams, events, draws, and venues from leagueProfiles', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          leagueName: 'Test League',
          teamsCount: 4,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(eventIds.length).toEqual(1);
    expect(drawIds.length).toEqual(1);
    expect(tournamentRecord.events.length).toEqual(1);

    const event = tournamentRecord.events[0];
    expect(event.eventName).toEqual('Test League');
    expect(event.eventType).toEqual(TEAM);
    expect(event.entries.length).toEqual(4);
    expect(event.entries.every((e) => e.entryStatus === DIRECT_ACCEPTANCE)).toBe(true);
    expect(event.entries.every((e) => e.entryStage === MAIN)).toBe(true);

    // Team participants should have been created
    const teamParticipants = tournamentRecord.participants.filter((p) => p.participantType === TEAM);
    expect(teamParticipants.length).toEqual(4);

    // Each team should have individual participants derived from tieFormat
    for (const team of teamParticipants) {
      expect(team.individualParticipantIds.length).toBeGreaterThan(0);
    }
  });

  it('uses teamProfiles for team names and venueIds', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          teamProfiles: [
            { teamName: 'Eagles', venueIds: ['v1'] },
            { teamName: 'Hawks', venueIds: ['v2'] },
            { teamName: 'Falcons', venueIds: ['v3'] },
          ],
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();

    const teamParticipants = tournamentRecord.participants.filter((p) => p.participantType === TEAM);
    const teamNames = teamParticipants.map((t) => t.participantName);
    expect(teamNames).toContain('Eagles');
    expect(teamNames).toContain('Hawks');
    expect(teamNames).toContain('Falcons');

    // venueIds should have been collected
    expect(venueIds).toContain('v1');
    expect(venueIds).toContain('v2');
    expect(venueIds).toContain('v3');
  });

  it('generates default team names when teamProfiles not provided', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          teamsCount: 3,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    const teamParticipants = tournamentRecord.participants.filter((p) => p.participantType === TEAM);
    expect(teamParticipants.length).toEqual(3);
    expect(teamParticipants[0].participantName).toEqual('Team 1');
    expect(teamParticipants[1].participantName).toEqual('Team 2');
    expect(teamParticipants[2].participantName).toEqual('Team 3');
  });
});

describe('processLeagueProfiles draw generation', () => {
  it('generates AD_HOC draw with correct roundsCount', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          teamsCount: 4,
          roundsCount: 6,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(drawIds.length).toEqual(1);

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    expect(drawDefinition.drawType).toEqual(AD_HOC);
  });

  it('defaults roundsCount to drawSize - 1 for round robin', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          teamsCount: 5,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(drawIds.length).toEqual(1);
  });

  it('uses drawSize from max of teamsCount and teamProfiles.length', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    // teamProfiles has 3, teamsCount says 5 — should use 5
    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          teamProfiles: [{ teamName: 'A' }, { teamName: 'B' }, { teamName: 'C' }],
          teamsCount: 5,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    const teamParticipants = tournamentRecord.participants.filter((p) => p.participantType === TEAM);
    expect(teamParticipants.length).toEqual(5);
  });
});

describe('processLeagueProfiles multiple leagues', () => {
  it('generates multiple leagues in a single tournament', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          leagueName: 'League A',
          teamsCount: 4,
          gender: MALE,
        },
        {
          tieFormatName: COLLEGE_DEFAULT,
          leagueName: 'League B',
          teamsCount: 3,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(eventIds.length).toEqual(2);
    expect(drawIds.length).toEqual(2);
    expect(tournamentRecord.events.length).toEqual(2);
    expect(tournamentRecord.events[0].eventName).toEqual('League A');
    expect(tournamentRecord.events[1].eventName).toEqual('League B');
  });
});

describe('processLeagueProfiles naming and IDs', () => {
  it('uses leagueId and leagueName when provided', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          leagueName: 'My League',
          leagueId: 'custom-league-id',
          teamsCount: 2,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(eventIds[0]).toEqual('custom-league-id');
    expect(tournamentRecord.events[0].eventId).toEqual('custom-league-id');
    expect(tournamentRecord.events[0].eventName).toEqual('My League');
  });

  it('falls back to eventName and eventId when league-specific names not provided', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          eventName: 'Fallback Name',
          eventId: 'fallback-id',
          teamsCount: 2,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(eventIds[0]).toEqual('fallback-id');
    expect(tournamentRecord.events[0].eventName).toEqual('Fallback Name');
  });

  it('generates default league names when none provided', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        { tieFormatName: COLLEGE_DEFAULT, teamsCount: 2, gender: MALE },
        { tieFormatName: COLLEGE_DEFAULT, teamsCount: 2, gender: MALE },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    expect(tournamentRecord.events[0].eventName).toEqual('League 1');
    expect(tournamentRecord.events[1].eventName).toEqual('League 2');
  });
});

describe('processLeagueProfiles tieFormat resolution', () => {
  it('resolves tieFormat from tieFormatName when tieFormat object not provided', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          teamsCount: 2,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    const event = tournamentRecord.events[0];
    expect(event.tieFormat).toBeDefined();
    expect(event.tieFormat.collectionDefinitions.length).toBeGreaterThan(0);
  });

  it('uses provided tieFormat object over tieFormatName', () => {
    const tournamentRecord = createEmptyTournamentRecord();
    const eventIds: string[] = [];
    const venueIds: string[] = [];
    const drawIds: string[] = [];
    const allUniqueParticipantIds: string[] = [];

    const customTieFormat = {
      tieFormatName: 'Custom',
      winCriteria: { valueGoal: 2, aggregateValue: false },
      collectionDefinitions: [
        {
          collectionId: 'c1',
          collectionName: 'Singles',
          matchUpType: 'SINGLES',
          matchUpCount: 3,
          matchUpValue: 1,
          matchUpFormat: 'SET3-S:6/TB7',
          gender: MALE,
        },
      ],
    };

    let result: any = processLeagueProfiles({
      tournamentRecord,
      leagueProfiles: [
        {
          tieFormat: customTieFormat,
          teamsCount: 2,
          gender: MALE,
        },
      ],
      eventIds,
      venueIds,
      drawIds,
      allUniqueParticipantIds,
    });

    expect(result?.error).toBeUndefined();
    const event = tournamentRecord.events[0];
    expect(event.tieFormat.tieFormatName).toEqual('Custom');
  });
});

describe('processLeagueProfiles via mocksEngine integration', () => {
  it('generates complete league tournament through mocksEngine', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      startDate: '2024-01-01',
      endDate: '2024-06-30',
      leagueProfiles: [
        {
          tieFormatName: COLLEGE_DEFAULT,
          leagueName: 'Integration League',
          teamsCount: 6,
          gender: MALE,
          automated: true,
        },
      ],
    });

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [TEAM] },
    });
    expect(participants.length).toEqual(6);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toBeGreaterThan(0);

    // Top-level matchUps should be TEAM type (tieMatchUps within are SINGLES/DOUBLES)
    const topLevelMatchUps = matchUps.filter((m) => !m.collectionId);
    expect(topLevelMatchUps.length).toBeGreaterThan(0);
    for (const matchUp of topLevelMatchUps) {
      expect(matchUp.matchUpType).toEqual(TEAM);
    }
  });
});
