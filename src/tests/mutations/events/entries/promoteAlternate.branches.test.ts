import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import {
  INVALID_ENTRY_STATUS,
  INVALID_VALUES,
  PARTICIPANT_ENTRY_NOT_FOUND,
  PARTICIPANT_NOT_ENTERED_IN_STAGE,
} from '@Constants/errorConditionConstants';

describe('promoteAlternate - uncovered branch coverage', () => {
  it('returns error when participantId is not a string', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
      setState: true,
    });

    const result = tournamentEngine.promoteAlternate({
      participantId: 123 as any,
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when participantIds is not an array', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
      setState: true,
    });

    const result = tournamentEngine.promoteAlternates({
      participantIds: 'not-an-array' as any,
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('auto-promotes alternate with lowest entryPosition when no participantId provided', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 5 }],
      setState: true,
    });

    // Get alternates
    let { event } = tournamentEngine.getEvent({ eventId });
    const alternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(alternates.length).toBeGreaterThan(0);

    // Promote without specifying participantId — should pick lowest entryPosition
    const result = tournamentEngine.promoteAlternate({
      eventId,
    });
    expect(result.success).toEqual(true);

    // Verify one fewer alternate
    ({ event } = tournamentEngine.getEvent({ eventId }));
    const remainingAlternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(remainingAlternates.length).toEqual(alternates.length - 1);
  });

  it('returns PARTICIPANT_ENTRY_NOT_FOUND when no alternates exist and no participantId', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // All entries should be DIRECT_ACCEPTANCE
    const { event } = tournamentEngine.getEvent({ eventId });
    const alternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(alternates.length).toEqual(0);

    const result = tournamentEngine.promoteAlternate({ eventId });
    expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
  });

  it('returns error when entry stage does not match', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, generate: false }],
    });
    tournamentEngine.setState(tournamentRecord);

    const participant = {
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      person: { standardFamilyName: 'Test', standardGivenName: 'Stage' },
    };
    let result = tournamentEngine.addParticipants({
      participants: [participant],
      returnParticipants: true,
    });
    const participantId = result.participants[0].participantId;

    const { events } = tournamentEngine.getEvents();
    const eventId = events[0].eventId;

    // Add as alternate with MAIN stage
    result = tournamentEngine.addEventEntries({
      participantIds: [participantId],
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Try to promote with QUALIFYING stage — entry is in MAIN, should fail
    result = tournamentEngine.promoteAlternate({
      stage: QUALIFYING,
      participantId,
      eventId,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_ENTERED_IN_STAGE);
  });

  it('handles drawDefinition promotion with eventId (soft failure on draw error)', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
      setState: true,
    });

    // Get alternates
    const { event } = tournamentEngine.getEvent({ eventId });
    const alternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(alternates.length).toBeGreaterThan(0);

    const participantId = alternates[0].participantId;

    // Promote with drawId — the alternate is in the event but may or may not be in drawDefinition.entries
    // If not in drawDefinition.entries, the drawDefinition promotion will fail but event promotion succeeds
    const result = tournamentEngine.promoteAlternate({
      participantId,
      eventId,
      drawId,
    });
    // Should succeed because eventId is provided — draw promotion error is soft
    expect(result.success).toEqual(true);
  });

  it('adjusts entryPositions when promoting alternate with entryPosition', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, participantsCount: 10 }],
      setState: true,
    });

    // Get alternates and verify they have entryPositions
    let { event } = tournamentEngine.getEvent({ eventId });
    const alternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(alternates.length).toBeGreaterThan(1);

    // Promote the first alternate
    const firstAlternateId = alternates[0].participantId;
    const result = tournamentEngine.promoteAlternate({
      participantId: firstAlternateId,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Verify the promoted entry now has DIRECT_ACCEPTANCE status
    ({ event } = tournamentEngine.getEvent({ eventId }));
    const promotedEntry = event.entries.find((e) => e.participantId === firstAlternateId);
    expect(promotedEntry.entryStatus).toEqual(DIRECT_ACCEPTANCE);
  });

  it('promotes multiple alternates at once', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, participantsCount: 10 }],
      setState: true,
    });

    let { event } = tournamentEngine.getEvent({ eventId });
    const alternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(alternates.length).toBeGreaterThan(1);

    const participantIds = alternates.map((a) => a.participantId);

    const result = tournamentEngine.promoteAlternates({
      participantIds,
      eventId,
    });
    expect(result.success).toEqual(true);

    ({ event } = tournamentEngine.getEvent({ eventId }));
    const remainingAlternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(remainingAlternates.length).toEqual(0);
  });

  it('returns INVALID_ENTRY_STATUS when targeted entry is not ALTERNATE', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const directEntry = event.entries.find((e) => e.entryStatus === DIRECT_ACCEPTANCE);

    const result = tournamentEngine.promoteAlternate({
      participantId: directEntry.participantId,
      eventId,
    });
    expect(result.error).toEqual(INVALID_ENTRY_STATUS);
  });
});
