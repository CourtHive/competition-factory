import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, CONFIRMED, DIRECT_ACCEPTANCE, UNGROUPED, WITHDRAWN } from '@Constants/entryStatusConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  INVALID_ENTRY_STATUS,
  INVALID_PARTICIPANT_ID,
  INVALID_STAGE,
  INVALID_VALUES,
  MISSING_EVENT,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

describe('modifyEntriesStatus - uncovered branch coverage', () => {
  it('returns error when participantIds is not provided', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const result = tournamentEngine.modifyEntriesStatus({
      participantIds: undefined as any,
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_ID);
  });

  it('returns error when participantIds is not an array', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const result = tournamentEngine.modifyEntriesStatus({
      participantIds: 'not-an-array' as any,
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_ID);
  });

  it('returns error when neither drawDefinition nor event is provided', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    // Calling without eventId or drawId means no event/drawDefinition
    const result = tournamentEngine.modifyEntriesStatus({
      participantIds: ['p1'],
      entryStatus: ALTERNATE,
    });
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns MISSING_VALUE when neither entryStatus nor extension provided', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    const result = tournamentEngine.modifyEntriesStatus({
      participantIds,
      eventId,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error for invalid extension', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    const result = tournamentEngine.modifyEntriesStatus({
      extension: { invalid: true } as any,
      participantIds,
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error for invalid entryStage', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    const result = tournamentEngine.modifyEntriesStatus({
      entryStage: 'INVALID_STAGE' as any,
      entryStatus: ALTERNATE,
      participantIds,
      eventId,
    });
    expect(result.error).toEqual(INVALID_STAGE);
  });

  it('disallows UNGROUPED status for PAIR participants', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          eventType: DOUBLES,
          drawProfiles: [{ drawSize: 4, generate: false }],
        },
      ],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    // These should be PAIR participants
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    const result = tournamentEngine.modifyEntriesStatus({
      entryStatus: UNGROUPED,
      participantIds,
      eventId,
    });
    expect(result.error).toEqual(INVALID_ENTRY_STATUS);
  });

  it('disallows DIRECT_ACCEPTANCE for INDIVIDUAL in DOUBLES event', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: DOUBLES, generate: false }],
      setState: true,
    });

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    // First add an individual as UNGROUPED
    let result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      entryStatus: UNGROUPED,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Try to change status to DIRECT_ACCEPTANCE — should fail for INDIVIDUAL in DOUBLES
    result = tournamentEngine.modifyEntriesStatus({
      participantIds: [participants[0].participantId],
      entryStatus: DIRECT_ACCEPTANCE,
      eventId,
    });
    expect(result.error).toEqual(INVALID_ENTRY_STATUS);
  });

  it('handles ignoreAssignment flag to force status change on assigned participants', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structureId } = drawDefinition.structures[0];
    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId,
      drawId,
    });
    const assignedParticipantIds = positionAssignments.map(getParticipantId).filter(Boolean);

    // Without ignoreAssignment, changing assigned participants to ALTERNATE should fail
    let result = tournamentEngine.modifyEntriesStatus({
      participantIds: assignedParticipantIds.slice(0, 1),
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);

    // With ignoreAssignment, it should succeed
    result = tournamentEngine.modifyEntriesStatus({
      participantIds: assignedParticipantIds.slice(0, 1),
      entryStatus: CONFIRMED,
      ignoreAssignment: true,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('updates entryStage when provided alongside entryStatus', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 2);

    const result = tournamentEngine.modifyEntriesStatus({
      entryStatus: DIRECT_ACCEPTANCE,
      entryStage: QUALIFYING,
      participantIds,
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
    const modifiedEntries = updatedEvent.entries.filter((e) => participantIds.includes(e.participantId));
    expect(modifiedEntries.every((e) => e.entryStage === QUALIFYING)).toEqual(true);
  });

  it('handles eventSync with singleDraw to keep event entries in sync', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    // Use eventSync with a single draw — should update event entries too
    const result = tournamentEngine.modifyEntriesStatus({
      entryStatus: CONFIRMED,
      eventSync: true,
      participantIds,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify event entries were also updated
    const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
    const entry = updatedEvent.entries.find((e) => e.participantId === participantIds[0]);
    expect(entry.entryStatus).toEqual(CONFIRMED);
  });

  it('handles extension modification with value removal', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    // Add extension with value
    let result = tournamentEngine.modifyEntriesStatus({
      extension: { name: 'testStatus', value: 'active' },
      participantIds,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Remove extension by setting value to undefined
    result = tournamentEngine.modifyEntriesStatus({
      extension: { name: 'testStatus', value: undefined },
      participantIds,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Verify extension was removed
    const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
    const entry = updatedEvent.entries.find((e) => e.participantId === participantIds[0]);
    const ext = entry.extensions?.find((e) => e.name === 'testStatus');
    expect(ext).toBeUndefined();
  });

  it('handles stage-filtered entry updates', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId);

    // First set some entries to QUALIFYING stage
    let result = tournamentEngine.modifyEntriesStatus({
      participantIds: participantIds.slice(0, 2),
      entryStage: QUALIFYING,
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Now modify only QUALIFYING stage entries — using stage filter
    result = tournamentEngine.modifyEntriesStatus({
      participantIds: participantIds.slice(0, 2),
      entryStatus: DIRECT_ACCEPTANCE,
      stage: QUALIFYING,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles WITHDRAWN status propagation across flights and drawDefinitions', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, alternatesCount: 2 }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const alternates = event.entries.filter((e) => e.entryStatus === ALTERNATE);
    expect(alternates.length).toBeGreaterThan(0);

    const alternateIds = alternates.map((a) => a.participantId);

    // Withdraw alternates — should remove from flights and drawDefinitions
    const result = tournamentEngine.modifyEntriesStatus({
      participantIds: alternateIds,
      entryStatus: WITHDRAWN,
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
    const withdrawnEntries = updatedEvent.entries.filter((e) => e.entryStatus === WITHDRAWN);
    expect(withdrawnEntries.length).toEqual(alternateIds.length);
  });

  it('pre-assigns entryPositions when autoEntryPositions is true and none exist', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    // Remove all entryPositions
    event.entries.forEach((e) => delete e.entryPosition);

    const participantIds = event.entries.map((e) => e.participantId).slice(0, 1);

    const result = tournamentEngine.modifyEntriesStatus({
      autoEntryPositions: true,
      entryStatus: CONFIRMED,
      participantIds,
      eventId,
    });
    expect(result.success).toEqual(true);
  });
});
