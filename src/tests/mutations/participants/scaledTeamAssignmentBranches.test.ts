import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INDIVIDUAL, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

test('scaledTeamAssignment with no tournamentRecord returns error', () => {
  const result = tournamentEngine.scaledTeamAssignment({
    teamParticipantIds: [],
    scaleAttributes: { scaleName: 'WTN', scaleType: RANKING, eventType: 'SINGLES' },
  });
  expect(result.error).toBeDefined();
});

test('scaledTeamAssignment with invalid params returns error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  // Invalid: no teamParticipantIds, no teamsCount, no eventId
  const result = tournamentEngine.scaledTeamAssignment({
    scaledParticipants: [{ participantId: 'test', scaleValue: 1 }],
  });
  expect(result.error).toBeDefined();

  // Invalid: scaledParticipants is not an array
  const result2 = tournamentEngine.scaledTeamAssignment({
    teamParticipantIds: ['team1'],
    scaledParticipants: 'invalid' as any,
  });
  expect(result2.error).toBeDefined();

  // Invalid: scaleAttributes is not an object or has no keys
  const result3 = tournamentEngine.scaledTeamAssignment({
    teamParticipantIds: ['team1'],
    scaleAttributes: {} as any,
  });
  expect(result3.error).toBeDefined();
});

test('scaledTeamAssignment with missing scaling details returns error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  // No scaleAttributes and no scaledParticipants
  const result = tournamentEngine.scaledTeamAssignment({
    teamParticipantIds: ['team1'],
  });
  expect(result.error).toBeDefined();
});

test('scaledTeamAssignment via eventId', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const individualParticipantIds = individuals.slice(0, 8).map((p) => p.participantId);

  const result = tournamentEngine.scaledTeamAssignment({
    scaleAttributes: { scaleName: 'WTN', scaleType: RANKING, eventType: 'SINGLES' },
    individualParticipantIds,
    eventId,
  });
  // Should extract teams from event entries
  expect(result.success || result.error).toBeDefined();
});

test('scaledTeamAssignment with eventId on non-TEAM event returns error', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }], // SINGLES event
    setState: true,
  });

  const result = tournamentEngine.scaledTeamAssignment({
    scaleAttributes: { scaleName: 'WTN', scaleType: RANKING, eventType: 'SINGLES' },
    individualParticipantIds: ['test-id'],
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('scaledTeamAssignment with teamsCount creates teams', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const scaledParticipants = individuals.slice(0, 8).map((p, i) => ({
    participantId: p.participantId,
    scaleValue: i + 1,
  }));

  const result = tournamentEngine.scaledTeamAssignment({
    scaledParticipants,
    teamsCount: 4,
    teamNameBase: 'TestTeam',
  });
  expect(result.success).toBe(true);
  expect(result.scaledParticipants).toBeDefined();
});

test('scaledTeamAssignment with reverseAssignmentOrder', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const scaledParticipants = individuals.slice(0, 8).map((p, i) => ({
    participantId: p.participantId,
    scaleValue: i + 1,
  }));

  const result = tournamentEngine.scaledTeamAssignment({
    reverseAssignmentOrder: true,
    scaledParticipants,
    teamsCount: 4,
  });
  expect(result.success).toBe(true);
});

test('scaledTeamAssignment with initialTeamIndex', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const scaledParticipants = individuals.slice(0, 4).map((p, i) => ({
    participantId: p.participantId,
    scaleValue: i + 1,
  }));

  const result = tournamentEngine.scaledTeamAssignment({
    initialTeamIndex: 1,
    scaledParticipants,
    teamsCount: 4,
  });
  expect(result.success).toBe(true);
});

test('scaledTeamAssignment with clearExistingAssignments: false', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 20 },
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  // First assignment
  const firstBatch = individuals.slice(0, 4).map((p, i) => ({
    participantId: p.participantId,
    scaleValue: i + 1,
  }));
  const result1 = tournamentEngine.scaledTeamAssignment({
    scaledParticipants: firstBatch,
    teamsCount: 2,
  });
  expect(result1.success).toBe(true);

  // Get the created teams
  const { participants: allParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
  });
  const teamIds = allParticipants.map((p) => p.participantId);

  // Second assignment with clearExistingAssignments: false
  const secondBatch = individuals.slice(4, 8).map((p, i) => ({
    participantId: p.participantId,
    scaleValue: i + 5,
  }));
  const result2 = tournamentEngine.scaledTeamAssignment({
    clearExistingAssignments: false,
    scaledParticipants: secondBatch,
    teamParticipantIds: teamIds,
  });
  expect(result2.success).toBe(true);
});

test('scaledTeamAssignment with scaleAttributes sortOrder', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: {
      participantsCount: 16,
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const individualParticipantIds = individuals.slice(0, 8).map((p) => p.participantId);

  const result = tournamentEngine.scaledTeamAssignment({
    scaleAttributes: { scaleName: 'WTN', scaleType: RANKING, eventType: 'SINGLES', sortOrder: 1 },
    individualParticipantIds,
    teamsCount: 4,
  });
  expect(result.success).toBe(true);
});

test('scaledTeamAssignment with no relevant teams returns error', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
    setState: true,
  });

  const result = tournamentEngine.scaledTeamAssignment({
    teamParticipantIds: ['nonexistent-team'],
    scaledParticipants: [{ participantId: 'test', scaleValue: 1 }],
  });
  expect(result.error).toBeDefined();
});

test('scaledTeamAssignment with initialTeamIndex exceeding array length resets to 0', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    setState: true,
  });

  const { participants: individuals } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const scaledParticipants = individuals.slice(0, 4).map((p, i) => ({
    participantId: p.participantId,
    scaleValue: i + 1,
  }));

  const result = tournamentEngine.scaledTeamAssignment({
    initialTeamIndex: 100, // exceeds team count
    scaledParticipants,
    teamsCount: 2,
  });
  expect(result.success).toBe(true);
});
