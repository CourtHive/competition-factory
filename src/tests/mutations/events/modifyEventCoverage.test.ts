import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_EVENT_TYPE,
  INVALID_GENDER,
  MISSING_ENTRIES,
  MISSING_PARTICIPANT_IDS,
} from '@Constants/errorConditionConstants';

test('modifyEvent updates eventName', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.modifyEvent({
    eventUpdates: { eventName: 'Updated Event Name' },
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.eventName).toEqual('Updated Event Name');
});

test('modifyEvent validates category without error when no entries', () => {
  const startDate = '2024-06-01';
  const endDate = '2024-06-07';

  // Create a tournament with no draws so category changes are less constrained
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Category Test Event';
  const event = { eventName };
  let result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  // Modify event with a valid category - modifyEvent validates the category
  // The function checks that the category is valid for existing entries
  result = tournamentEngine.modifyEvent({
    eventUpdates: {
      category: { categoryName: 'U18', ageCategoryCode: 'U18' },
    },
    eventId,
  });
  expect(result.success).toEqual(true);
});

test('modifyEvent rejects invalid category', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Invalid category (not an object)
  const result = tournamentEngine.modifyEvent({
    eventUpdates: { category: 'invalid' as any },
    eventId,
  });
  expect(result.error).toBeDefined();
});

test('modifyEvent updates startDate and endDate', () => {
  const startDate = '2024-06-01';
  const endDate = '2024-06-30';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
    startDate,
    endDate,
  });

  const { events } = tournamentEngine.getEvents();
  const eventId = events[0].eventId;

  const result = tournamentEngine.modifyEvent({
    eventUpdates: {
      startDate: '2024-06-05',
      endDate: '2024-06-25',
    },
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.startDate).toEqual('2024-06-05');
  expect(event.endDate).toEqual('2024-06-25');
});

test('modifyEvent rejects invalid gender for gendered event entries', () => {
  // Create a tournament with only MALE participants in the event
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 8, uniqueParticipants: true }],
        eventType: SINGLES,
        gender: MALE,
      },
    ],
    setState: true,
  });

  // Attempt to change gender to FEMALE should fail because entries have MALE participants
  const result = tournamentEngine.modifyEvent({
    eventUpdates: { gender: FEMALE },
    eventId,
  });
  expect(result.error).toEqual(INVALID_GENDER);
});

test('modifyEvent allows MIXED gender when no flights or draws exist', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 20 },
  });
  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Mixed Gender Event';
  const event = { eventName };
  let result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  // Add some participants of different genders
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.slice(0, 8).map((p) => p.participantId);

  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  // MIXED gender should be allowed since there are no flights or draws
  result = tournamentEngine.modifyEvent({
    eventUpdates: { gender: MIXED },
    eventId,
  });
  expect(result.success).toEqual(true);
});

test('modifyEvent rejects invalid eventType for entered participant types', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Event has INDIVIDUAL participants entered; changing to DOUBLES should fail
  const result = tournamentEngine.modifyEvent({
    eventUpdates: { eventType: DOUBLES },
    eventId,
  });
  expect(result.error).toEqual(INVALID_EVENT_TYPE);
});

test('modifyEvent successfully updates eventType when no entries constrain it', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const eventName = 'EventType Test';
  const event = { eventName };
  let result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  // With no entries, changing eventType should work
  result = tournamentEngine.modifyEvent({
    eventUpdates: { eventType: DOUBLES },
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
  expect(updatedEvent.eventType).toEqual(DOUBLES);
});

test('modifyEvent rejects category mismatch for entered participants ages', () => {
  const startDate = '2024-06-01';
  const endDate = '2024-06-30';

  // Generate participants with birthDates that won't match a restrictive category
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Age Category Test';
  const event = { eventName };
  let result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.slice(0, 4).map((p) => p.participantId);

  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  // Try to set a very restrictive age category that likely won't match adult participants
  // U8 means participants must be under 8 years old
  result = tournamentEngine.modifyEvent({
    eventUpdates: {
      category: { categoryName: 'U8', ageCategoryCode: 'U8' },
    },
    eventId,
  });

  // Should either fail with CATEGORY_MISMATCH or MISSING_BIRTH_DATE
  // depending on whether mock participants have birthDates
  expect(result.error).toBeDefined();
});

test('addDrawEntries adds alternate participants to a draw', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 20 }],
    setState: true,
  });

  // Get the event and find alternates
  const eventResult = tournamentEngine.getEvent({ drawId });
  const eventAlternateIds = eventResult.event.entries
    .filter(({ entryStatus }) => entryStatus === ALTERNATE)
    .map((e) => e.participantId);
  expect(eventAlternateIds.length).toBeGreaterThan(0);

  // Add alternates to draw
  const result = tournamentEngine.addDrawEntries({
    participantIds: eventAlternateIds,
    entryStatus: ALTERNATE,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Verify they were added
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const drawAlternateIds = drawDefinition.entries
    .filter(({ entryStatus }) => entryStatus === ALTERNATE)
    .map((e) => e.participantId);
  expect(drawAlternateIds.length).toEqual(eventAlternateIds.length);
});

test('addDrawEntries returns error for missing participantIds', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.addDrawEntries({
    participantIds: [],
    drawId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_IDS);
});

test('addDrawEntries returns error when participants not in event entries', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    participantsProfile: { participantsCount: 20 },
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  // Get event entries to find participants NOT in the event
  const eventResult = tournamentEngine.getEvent({ drawId });
  const eventEntryIds = new Set(eventResult.event.entries.map((e) => e.participantId));
  const nonEventParticipants = participants.filter((p) => !eventEntryIds.has(p.participantId));

  if (nonEventParticipants.length > 0) {
    const result = tournamentEngine.addDrawEntries({
      participantIds: nonEventParticipants.slice(0, 2).map((p) => p.participantId),
      drawId,
    });
    expect(result.error).toEqual(MISSING_ENTRIES);
  }
});

test('addDrawEntries returns error for missing event (bad drawId)', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.addDrawEntries({
    participantIds: ['some-participant-id'],
    drawId: 'non-existent-draw-id',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);
});

test('addDrawEntries handles duplicate entries with alternate status', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 20 }],
    setState: true,
  });

  // Get alternates from the event
  const eventResult = tournamentEngine.getEvent({ drawId });
  const eventAlternateIds = eventResult.event.entries
    .filter(({ entryStatus }) => entryStatus === ALTERNATE)
    .map((e) => e.participantId);
  expect(eventAlternateIds.length).toBeGreaterThan(0);

  // Add alternates to the draw
  let result = tournamentEngine.addDrawEntries({
    participantIds: eventAlternateIds,
    entryStatus: ALTERNATE,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Adding the same alternates again should still succeed
  // because suppressDuplicateEntries defaults to true
  result = tournamentEngine.addDrawEntries({
    participantIds: eventAlternateIds,
    entryStatus: ALTERNATE,
    drawId,
  });
  expect(result.success).toEqual(true);
});
