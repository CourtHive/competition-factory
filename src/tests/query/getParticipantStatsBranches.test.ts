import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import { xa } from '@Tools/extractAttributes';

// constants
import { MISSING_TOURNAMENT_RECORD, INVALID_MATCHUP, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('getParticipantStats error conditions', () => {
  it('returns error when no tournament record', () => {
    const result = tournamentEngine.getParticipantStats({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when matchUps is not an array', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      policyDefinitions,
      setState: true,
    });
    const result = tournamentEngine.getParticipantStats({ matchUps: 'invalid' as any });
    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  it('returns error when matchUps array is empty', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      policyDefinitions,
      setState: true,
    });
    const result = tournamentEngine.getParticipantStats({ matchUps: [] });
    expect(result.error).toEqual(MISSING_MATCHUPS);
  });

  it('returns error when matchUps contains non-object', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      policyDefinitions,
      setState: true,
    });
    const result = tournamentEngine.getParticipantStats({ matchUps: ['notAnObject'] as any });
    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  it('returns error when teamParticipantId is not found', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });
    const result = tournamentEngine.getParticipantStats({ teamParticipantId: 'nonexistent' });
    expect(result.error).toBeDefined();
  });

  it('returns error when opponentParticipantId is not found', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    });
    const teamId = matchUps[0].sides[0].participantId;
    const result = tournamentEngine.getParticipantStats({
      teamParticipantId: teamId,
      opponentParticipantId: 'nonexistent',
    });
    expect(result.error).toBeDefined();
  });

  it('returns INVALID_PARTICIPANT_IDS when participant is not TEAM type', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });
    // Get an individual participant
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: ['INDIVIDUAL'] },
    });
    const individualId = participants[0].participantId;
    const result = tournamentEngine.getParticipantStats({ teamParticipantId: individualId });
    expect(result.error).toBeDefined();
  });
});

describe('getParticipantStats with withIndividualStats', () => {
  it('returns stats with individual stats breakdown', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });

    const result = tournamentEngine.getParticipantStats({
      withIndividualStats: true,
    });

    expect(result.success).toBe(true);
    expect(result.allParticipantStats.length).toBeGreaterThan(0);
  });
});

describe('getParticipantStats with withScaleValues', () => {
  it('passes withScaleValues to getParticipants', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });

    const result = tournamentEngine.getParticipantStats({
      withScaleValues: true,
    });

    expect(result.success).toBe(true);
  });
});

describe('getParticipantStats with teamParticipantId and opponentParticipantId', () => {
  it('filters to just the two teams when both are specified', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    });
    const [team1, team2] = matchUps[0].sides.map(xa('participantId'));

    const result = tournamentEngine.getParticipantStats({
      teamParticipantId: team1,
      opponentParticipantId: team2,
    });

    expect(result.success).toBe(true);
    expect(result.teamStats).toBeDefined();
    expect(result.opponentStats).toBeDefined();
    expect(result.allParticipantStats.length).toEqual(2);
  });
});
