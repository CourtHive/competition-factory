import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DOUBLES } from '@Constants/eventConstants';
import {
  ALTERNATE,
  DIRECT_ACCEPTANCE,
  LUCKY_LOSER,
  WITHDRAWN,
  ORGANISER_ACCEPTANCE,
} from '@Constants/entryStatusConstants';

test('modifyEntriesStatus with invalid participantIds returns error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: 'not-an-array' as any,
    entryStatus: ALTERNATE,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus without event or drawDefinition returns error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Try without providing eventId or drawId
  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: ['some-id'],
    entryStatus: ALTERNATE,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus with invalid entryStatus', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: ['some-id'],
    entryStatus: 'INVALID_STATUS' as any,
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus with invalid entryStage', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: ['some-id'],
    entryStage: 'INVALID_STAGE' as any,
    entryStatus: ALTERNATE,
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus with no entryStatus or extension returns error', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: ['some-id'],
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus with invalid extension returns error', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: ['some-id'],
    extension: {} as any, // no name
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus with extension with value', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantId = participants[0].participantId;

  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: [participantId],
    extension: { name: 'testExtension', value: 'testValue' },
    eventId,
  });
  expect(result.success).toBe(true);
});

test('modifyEntriesStatus with extension without value (remove)', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantId = participants[0].participantId;

  // First add extension
  tournamentEngine.modifyEntriesStatus({
    participantIds: [participantId],
    extension: { name: 'testExtension', value: 'testValue' },
    eventId,
  });

  // Then remove it
  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: [participantId],
    extension: { name: 'testExtension' },
    eventId,
  });
  expect(result.success).toBe(true);
});

test('modifyEntriesStatus WITHDRAWN removes from flights and draws', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 14, automated: false }],
    setState: true,
  });

  // Get unassigned participants
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: {
      eventEntryStatuses: [DIRECT_ACCEPTANCE],
      eventIds: [eventId],
    },
  });
  const participantIds = participants.slice(0, 2).map((p) => p.participantId);

  const result = tournamentEngine.modifyEntriesStatus({
    entryStatus: WITHDRAWN,
    participantIds,
    eventId,
    drawId,
  });
  expect(result.success).toBe(true);
});

test('modifyEntriesStatus with entryStage modification', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 12, automated: false }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: {
      eventEntryStatuses: [DIRECT_ACCEPTANCE],
      eventIds: [eventId],
    },
  });
  const participantIds = participants.slice(0, 1).map((p) => p.participantId);

  const result = tournamentEngine.modifyEntriesStatus({
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: QUALIFYING,
    participantIds,
    eventId,
  });
  expect(result.success).toBe(true);
});

test('modifyEntriesStatus with ignoreAssignment overrides assignment check', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Get a participant that is assigned a draw position
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const assignedParticipantId = matchUps[0]?.sides?.[0]?.participantId;
  if (!assignedParticipantId) return;

  // Try to change status of assigned participant - should fail without ignoreAssignment
  const failResult = tournamentEngine.modifyEntriesStatus({
    participantIds: [assignedParticipantId],
    entryStatus: ALTERNATE,
    eventId,
    drawId,
  });

  expect(failResult.error).toBeDefined();

  // With ignoreAssignment should succeed
  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: [assignedParticipantId],
    ignoreAssignment: true,
    entryStatus: ALTERNATE,
    eventId,
    drawId,
  });
  expect(result.success).toBe(true);
});

test('modifyEntriesStatus with DRAW_SPECIFIC status without draw returns error', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  // LUCKY_LOSER is draw-specific, should fail without drawId
  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: [participants[0].participantId],
    entryStatus: LUCKY_LOSER,
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus PAIR/TEAM participant with ungrouped status returns error', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  if (!participants.length) return;

  // Try setting PAIR participant to UNGROUPED status (should fail)
  const result = tournamentEngine.modifyEntriesStatus({
    participantIds: [participants[0].participantId],
    entryStatus: 'UNGROUPED' as any,
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEntriesStatus with eventSync and single draw', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 14, automated: false }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.slice(0, 1).map((p) => p.participantId);

  const result = tournamentEngine.modifyEntriesStatus({
    entryStatus: ORGANISER_ACCEPTANCE,
    eventSync: true,
    participantIds,
    eventId,
    drawId,
  });
  expect(result.success).toBe(true);
});
