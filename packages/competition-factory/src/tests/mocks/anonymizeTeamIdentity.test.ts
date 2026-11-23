import { anonymizeTournamentRecord } from '@Generators/tournamentRecords/anonymizeTournamentRecord';
import { expect, test } from 'vitest';

test('team identities and affiliations remap together without changing canonical membership or results', () => {
  const record: any = {
    tournamentId: 'SOURCE_TOURNAMENT',
    participants: [
      {
        participantId: 'SOURCE_TEAM_PARTICIPANT',
        participantType: 'TEAM',
        teamId: 'SOURCE_TEAM',
        individualParticipantIds: ['PLAYER'],
      },
      {
        participantId: 'PLAYER',
        participantType: 'INDIVIDUAL',
        person: { personId: 'SOURCE_PERSON', sex: 'MALE' },
        teamId: 'SOURCE_TEAM',
        team: {
          teamId: 'SOURCE_TEAM',
          teamName: 'PRIVATE_TEAM',
          nativeTeamName: 'PRIVATE_NATIVE',
          otherTeamNames: ['PRIVATE_ALIAS'],
        },
      },
    ],
    matchUps: [
      {
        matchUpId: 'SOURCE_MATCH',
        matchUpType: 'TEAM',
        winningSide: 1,
        sides: [{ sideNumber: 1, participantId: 'SOURCE_TEAM_PARTICIPANT' }],
      },
    ],
  };
  let result: any = anonymizeTournamentRecord({ tournamentRecord: structuredClone(record) });
  const [team, player] = result.tournamentRecord.participants;
  expect(result.success).toBe(true);
  expect(team.teamId).not.toBe('SOURCE_TEAM');
  expect(player.teamId).toBe(team.teamId);
  expect(player.team.teamId).toBe(team.teamId);
  expect(player.team.teamName).toBe(player.team.nativeTeamName);
  expect(player.team.teamName).toMatch(/^Team \d+$/);
  expect(player.team.otherTeamNames).toBeUndefined();
  expect(team.individualParticipantIds).toEqual([player.participantId]);
  expect(result.tournamentRecord.matchUps[0].sides[0].participantId).toBe(team.participantId);
  expect(result.tournamentRecord.matchUps[0].winningSide).toBe(1);
  expect(JSON.stringify(result.tournamentRecord)).not.toContain('SOURCE_');
  expect(JSON.stringify(result.tournamentRecord)).not.toContain('PRIVATE_');
  expect(record.participants[1].team.teamName).toBe('PRIVATE_TEAM');
});

test('team references in extension keys follow the same map while the name opt-out remains explicit', () => {
  const record: any = {
    tournamentId: 'SOURCE_TOURNAMENT',
    participants: [
      {
        participantId: 'SOURCE_TEAM_PARTICIPANT',
        participantType: 'TEAM',
        teamId: 'SOURCE_TEAM',
        teamName: 'PRIVATE_TEAM',
      },
    ],
    extensions: [{ name: 'customTeams', value: { SOURCE_TEAM: { teamId: 'SOURCE_TEAM' } } }],
  };
  let result: any = anonymizeTournamentRecord({
    tournamentRecord: record,
    anonymizeParticipantNames: false,
    keepExtensions: ['customTeams'],
  });
  const team = result.tournamentRecord.participants[0];
  expect(team.teamName).toBe('PRIVATE_TEAM');
  expect(team.teamId).not.toBe('SOURCE_TEAM');
  expect(Object.keys(result.tournamentRecord.extensions[0].value)).toEqual([team.teamId]);
  expect(result.tournamentRecord.extensions[0].value[team.teamId].teamId).toBe(team.teamId);
});
