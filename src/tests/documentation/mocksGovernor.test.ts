import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { MALE, FEMALE } from '@Constants/genderConstants';

// NOTE: More comprehensive tests exist in:
// - src/tests/mutations/tournaments/anonymizeTournamentRecord.test.ts
// - src/tests/generators/mocks/modifyTournamentRecord.test.ts
// This file validates that documented features are accurate (no hallucinations)

test('anonymizeTournamentRecord - basic usage', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const originalParticipantIds = new Set(tournamentRecord.participants.map((p) => p.participantId));
  const originalPersonIds = new Set(tournamentRecord.participants.map((p) => p.person?.personId));

  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord,
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.isMock).toEqual(true);
  expect(tournamentRecord.tournamentName).toContain('Anonymized');

  // Verify all IDs changed
  const newParticipantIds = tournamentRecord.participants.map((p) => p.participantId);
  const newPersonIds = tournamentRecord.participants.map((p) => p.person?.personId);

  expect(newParticipantIds.every((id) => !originalParticipantIds.has(id))).toEqual(true);
  expect(newPersonIds.every((id) => !originalPersonIds.has(id))).toEqual(true);
});

test('anonymizeTournamentRecord - with tournamentName and tournamentId', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const customTournamentId = 'custom-tournament-id';
  const customName = 'Test Tournament';

  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord,
    tournamentId: customTournamentId,
    tournamentName: customName,
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.tournamentId).toEqual(customTournamentId);
  expect(tournamentRecord.tournamentName).toEqual(customName);
});

test('anonymizeTournamentRecord - with personIds array', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const customPersonIds = ['person-1', 'person-2', 'person-3', 'person-4'];

  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord,
    personIds: customPersonIds,
  });

  expect(result.success).toEqual(true);

  const generatedPersonIds = tournamentRecord.participants.map((p) => p.person?.personId);
  expect(generatedPersonIds).toEqual(customPersonIds);
});

test('anonymizeTournamentRecord - keepExtensions parameter', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  // Add custom extension to first participant
  tournamentRecord.participants[0].extensions = [
    { name: 'level', value: 'advanced' },
    { name: 'club', value: 'Tennis Club' },
  ];

  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord,
    keepExtensions: ['level'], // Keep only 'level' extension
  });

  expect(result.success).toEqual(true);

  const firstParticipant = tournamentRecord.participants[0];
  const extensionNames = firstParticipant.extensions?.map((e) => e.name) || [];

  // Should keep 'level' but not 'club'
  expect(extensionNames.includes('level')).toEqual(true);
  expect(extensionNames.includes('club')).toEqual(false);
});

test('anonymizeTournamentRecord - anonymizeParticipantNames parameter', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const originalNames = tournamentRecord.participants.map((p) => p.participantName);

  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord,
    anonymizeParticipantNames: false, // Keep original names
  });

  expect(result.success).toEqual(true);

  const newNames = tournamentRecord.participants.map((p) => p.participantName);

  // Names should be preserved when anonymizeParticipantNames is false
  // (Note: personIds still change, but names remain)
  expect(newNames).toEqual(originalNames);
});

test('anonymizeTournamentRecord - error handling', () => {
  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord: undefined,
  });

  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

test('modifyTournamentRecord - add draw to existing tournament', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, eventType: SINGLES }],
  });

  const originalEventsCount = tournamentRecord.events.length;
  const originalParticipantsCount = tournamentRecord.participants.length;

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    drawProfiles: [{ drawSize: 16, eventType: DOUBLES }],
  });

  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(1);
  expect(result.eventIds.length).toEqual(1);

  // Should have added a new event
  expect(tournamentRecord.events.length).toEqual(originalEventsCount + 1);
  // Should have added new participants
  expect(tournamentRecord.participants.length).toBeGreaterThan(originalParticipantsCount);
});

test('modifyTournamentRecord - target existing event by eventId', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles: [{ eventName: 'Singles Main', gender: MALE }],
  });

  // Initially no draws (or empty array)
  expect(tournamentRecord.events[0].drawDefinitions?.length || 0).toEqual(0);

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles: [
      {
        eventId,
        drawProfiles: [{ drawSize: 16, drawName: 'Main Draw' }],
      },
    ],
  });

  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(1);

  // Should have added draw to existing event, not created new event
  expect(tournamentRecord.events.length).toEqual(1);
  expect(tournamentRecord.events[0].drawDefinitions.length).toEqual(1);
});

test('modifyTournamentRecord - target existing event by eventName', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles: [
      {
        eventName: 'U18 Singles',
        gender: MALE,
      },
    ],
  });

  // Initially no draws (or empty array)
  expect(tournamentRecord.events[0].drawDefinitions?.length || 0).toEqual(0);

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles: [
      {
        eventName: 'U18 Singles',
        drawProfiles: [{ drawSize: 16, drawName: 'Main Draw' }],
      },
    ],
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.events.length).toEqual(1);
  expect(tournamentRecord.events[0].drawDefinitions.length).toEqual(1);
});

test('modifyTournamentRecord - target existing event by eventIndex', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles: [
      { eventName: 'Event 1', gender: MALE },
      { eventName: 'Event 2', gender: FEMALE },
    ],
  });

  // Initially no draws (or empty array)
  expect(tournamentRecord.events[0].drawDefinitions?.length || 0).toEqual(0);

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles: [
      {
        eventIndex: 0, // Target first event
        drawProfiles: [{ drawSize: 8 }],
      },
    ],
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.events[0].drawDefinitions.length).toEqual(1);
});

test('modifyTournamentRecord - add participants via participantsProfile', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles: [{ eventName: 'Singles', gender: MALE }],
  });

  expect(tournamentRecord.participants.length).toEqual(0);

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    participantsProfile: { participantsCount: 16 },
    drawProfiles: [{ drawSize: 16, eventType: SINGLES }],
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.participants.length).toEqual(16);
});

test('modifyTournamentRecord - add venues', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const originalVenuesCount = tournamentRecord.venues?.length || 0;

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    venueProfiles: [{ courtsCount: 4, venueName: 'New Venue' }],
  });

  expect(result.success).toEqual(true);
  expect(result.venueIds.length).toEqual(1);
  expect((tournamentRecord.venues?.length || 0) - originalVenuesCount).toEqual(1);
});

test('modifyTournamentRecord - completionGoal parameter', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
  });

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles: [
      {
        eventIndex: 0,
        drawProfiles: [{ drawSize: 8, completionGoal: 4 }],
      },
    ],
  });

  expect(result.success).toEqual(true);
  // Note: Actual completion testing requires using tournamentEngine.tournamentMatchUps()
  // which is tested in modifyTournamentRecord.test.ts
});

test('modifyTournamentRecord - completeAllMatchUps parameter', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    drawProfiles: [{ drawSize: 4 }],
    completeAllMatchUps: true,
  });

  expect(result.success).toEqual(true);
  // Completion verified in existing tests
});

test('modifyTournamentRecord - randomWinningSide parameter', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    drawProfiles: [{ drawSize: 4 }],
    randomWinningSide: true,
    completeAllMatchUps: true,
  });

  expect(result.success).toEqual(true);
});

test('modifyTournamentRecord - error handling', () => {
  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord: undefined as any,
  });

  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

test('modifyTournamentRecord - progressive building', () => {
  // Build tournament incrementally
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentName: 'Progressive Tournament',
  });

  // Step 1: Add singles
  let result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    drawProfiles: [{ drawSize: 16, eventType: SINGLES }],
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.events.length).toEqual(1);

  // Step 2: Add doubles
  result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord.events.length).toEqual(2);

  // Verify final state
  expect(tournamentRecord.participants.length).toBeGreaterThan(0);
});
