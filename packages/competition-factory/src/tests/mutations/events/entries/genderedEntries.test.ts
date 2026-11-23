import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { FEMALE, FEMALE_ABBR, MALE, MALE_ABBR, MIXED } from '@Constants/genderConstants';
import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

it('throws an error on misgendered entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 16, gender: FEMALE },
      { drawSize: 16, gender: MALE },
    ],
  });
  const { participants } = tournamentRecord;
  const genders = unique(participants.map(({ person }) => person.sex)).sort();
  expect(genders).toEqual([FEMALE, MALE]);

  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    gender: MALE,
    eventName,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toBeGreaterThan(0);

  const maleParticipantIds = participants.filter(({ person }) => person.sex === MALE).map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({
    participantIds: maleParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addEventEntries({
    enforceGender: false,
    participantIds,
    eventId,
  });
  expect(result.success).toEqual(true);
});

it('validates gender for ungrouped doubles entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 16, gender: FEMALE },
      { drawSize: 16, gender: MALE },
    ],
  });
  const { participants } = tournamentRecord;
  const genders = unique(participants.map(({ person }) => person.sex)).sort();
  expect(genders).toEqual([FEMALE, MALE]);

  tournamentEngine.setState(tournamentRecord);

  // Create a Men's Doubles event
  const mensDoublesEvent = {
    eventType: DOUBLES,
    gender: MALE,
    eventName: "Men's Doubles",
  };

  let result = tournamentEngine.addEvent({ event: mensDoublesEvent });
  expect(result.success).toEqual(true);
  const mensDoublesEventId = result.event.eventId;

  // Create a Women's Doubles event
  const womensDoublesEvent = {
    eventType: DOUBLES,
    gender: FEMALE,
    eventName: "Women's Doubles",
  };

  result = tournamentEngine.addEvent({ event: womensDoublesEvent });
  expect(result.success).toEqual(true);
  const womensDoublesEventId = result.event.eventId;

  // Create a Mixed Doubles event
  const mixedDoublesEvent = {
    eventType: DOUBLES,
    gender: MIXED,
    eventName: 'Mixed Doubles',
  };

  result = tournamentEngine.addEvent({ event: mixedDoublesEvent });
  expect(result.success).toEqual(true);
  const mixedDoublesEventId = result.event.eventId;

  // Get male and female participants
  const maleParticipants = participants.filter(({ person }) => person.sex === MALE);
  const femaleParticipants = participants.filter(({ person }) => person.sex === FEMALE);
  const maleParticipantIds = maleParticipants.map((p) => p.participantId);
  const femaleParticipantIds = femaleParticipants.map((p) => p.participantId);

  // Test 1: Adding female participants to Men's Doubles with UNGROUPED status should fail
  result = tournamentEngine.addEventEntries({
    participantIds: femaleParticipantIds,
    entryStatus: UNGROUPED,
    eventId: mensDoublesEventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(femaleParticipantIds.length);
  expect(result.context.mismatchedGender.every((entry) => entry.sex === FEMALE)).toEqual(true);

  // Test 2: Adding male participants to Men's Doubles with UNGROUPED status should succeed
  result = tournamentEngine.addEventEntries({
    participantIds: maleParticipantIds,
    entryStatus: UNGROUPED,
    eventId: mensDoublesEventId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(maleParticipantIds.length);

  // Test 3: Adding male participants to Women's Doubles with UNGROUPED status should fail
  result = tournamentEngine.addEventEntries({
    participantIds: maleParticipantIds,
    entryStatus: UNGROUPED,
    eventId: womensDoublesEventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(maleParticipantIds.length);
  expect(result.context.mismatchedGender.every((entry) => entry.sex === MALE)).toEqual(true);

  // Test 4: Adding female participants to Women's Doubles with UNGROUPED status should succeed
  result = tournamentEngine.addEventEntries({
    participantIds: femaleParticipantIds,
    entryStatus: UNGROUPED,
    eventId: womensDoublesEventId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(femaleParticipantIds.length);

  // Test 5: Mixed Doubles should accept both male and female participants with UNGROUPED status
  result = tournamentEngine.addEventEntries({
    participantIds: [...maleParticipantIds.slice(0, 2), ...femaleParticipantIds.slice(0, 2)],
    entryStatus: UNGROUPED,
    eventId: mixedDoublesEventId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(4);

  // Test 6: enforceGender: false should allow any gender in gendered events
  result = tournamentEngine.addEventEntries({
    participantIds: femaleParticipantIds.slice(0, 2),
    eventId: mensDoublesEventId,
    entryStatus: UNGROUPED,
    enforceGender: false,
  });
  expect(result.success).toEqual(true);
});

it('accepts both short form (M/F) and long form (MALE/FEMALE) gender values', () => {
  // Manually create participants with short form sex values
  const maleParticipantShort = {
    participantId: 'male-short-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Smith',
      standardGivenName: 'John',
      sex: MALE_ABBR, // 'M'
    },
  };

  const femaleParticipantShort = {
    participantId: 'female-short-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Jones',
      standardGivenName: 'Jane',
      sex: FEMALE_ABBR, // 'F'
    },
  };

  const maleParticipantLong = {
    participantId: 'male-long-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Brown',
      standardGivenName: 'Bob',
      sex: MALE, // 'MALE'
    },
  };

  const femaleParticipantLong = {
    participantId: 'female-long-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Davis',
      standardGivenName: 'Diana',
      sex: FEMALE, // 'FEMALE'
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  // Add our custom participants
  tournamentRecord.participants = [
    maleParticipantShort,
    femaleParticipantShort,
    maleParticipantLong,
    femaleParticipantLong,
  ];

  tournamentEngine.setState(tournamentRecord);

  // Test 1: Event with gender 'MALE' should accept participants with sex 'M'
  let result = tournamentEngine.addEvent({
    event: { eventName: 'Male Event Long', eventType: SINGLES, gender: MALE },
  });
  expect(result.success).toEqual(true);
  const maleEventLongId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantShort.participantId],
    eventId: maleEventLongId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 2: Event with gender 'MALE' should accept participants with sex 'MALE'
  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantLong.participantId],
    eventId: maleEventLongId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 3: Event with gender 'M' should accept participants with sex 'MALE'
  result = tournamentEngine.addEvent({
    event: { eventName: 'Male Event Short', eventType: SINGLES, gender: MALE_ABBR },
  });
  expect(result.success).toEqual(true);
  const maleEventShortId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantLong.participantId],
    eventId: maleEventShortId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 4: Event with gender 'M' should accept participants with sex 'M'
  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantShort.participantId],
    eventId: maleEventShortId,
  });
  expect(result.success).toEqual(true);

  // Test 5: Event with gender 'FEMALE' should accept participants with sex 'F'
  result = tournamentEngine.addEvent({
    event: { eventName: 'Female Event Long', eventType: SINGLES, gender: FEMALE },
  });
  expect(result.success).toEqual(true);
  const femaleEventLongId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantShort.participantId],
    eventId: femaleEventLongId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 6: Event with gender 'FEMALE' should accept participants with sex 'FEMALE'
  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantLong.participantId],
    eventId: femaleEventLongId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 7: Event with gender 'F' should accept participants with sex 'FEMALE'
  result = tournamentEngine.addEvent({
    event: { eventName: 'Female Event Short', eventType: SINGLES, gender: FEMALE_ABBR },
  });
  expect(result.success).toEqual(true);
  const femaleEventShortId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantLong.participantId],
    eventId: femaleEventShortId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 8: Event with gender 'F' should accept participants with sex 'F'
  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantShort.participantId],
    eventId: femaleEventShortId,
  });
  expect(result.success).toEqual(true);

  // Test 9: Cross-gender should fail - 'F' participant in 'MALE' event
  result = tournamentEngine.addEvent({
    event: { eventName: 'Male Event Cross', eventType: SINGLES, gender: MALE },
  });
  expect(result.success).toEqual(true);
  const maleCrossEventId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantShort.participantId],
    eventId: maleCrossEventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(1);

  // Test 10: Cross-gender should fail - 'M' participant in 'FEMALE' event
  result = tournamentEngine.addEvent({
    event: { eventName: 'Female Event Cross', eventType: SINGLES, gender: FEMALE },
  });
  expect(result.success).toEqual(true);
  const femaleCrossEventId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantShort.participantId],
    eventId: femaleCrossEventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(1);
});

it('accepts both short and long form genders for ungrouped doubles entries', () => {
  // Create participants with mixed short/long form sex values
  const maleParticipantShort = {
    participantId: 'male-m-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Wilson',
      standardGivenName: 'Will',
      sex: MALE_ABBR, // 'M'
    },
  };

  const femaleParticipantShort = {
    participantId: 'female-f-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Taylor',
      standardGivenName: 'Tina',
      sex: FEMALE_ABBR, // 'F'
    },
  };

  const maleParticipantLong = {
    participantId: 'male-male-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Anderson',
      standardGivenName: 'Andy',
      sex: MALE, // 'MALE'
    },
  };

  const femaleParticipantLong = {
    participantId: 'female-female-1',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Martinez',
      standardGivenName: 'Maria',
      sex: FEMALE, // 'FEMALE'
    },
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentRecord.participants = [
    maleParticipantShort,
    femaleParticipantShort,
    maleParticipantLong,
    femaleParticipantLong,
  ];

  tournamentEngine.setState(tournamentRecord);

  // Test 1: Men's Doubles (MALE) should accept 'M' participants with UNGROUPED status
  let result = tournamentEngine.addEvent({
    event: { eventName: "Men's Doubles", eventType: DOUBLES, gender: MALE },
  });
  expect(result.success).toEqual(true);
  const mensDoublesId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantShort.participantId],
    entryStatus: UNGROUPED,
    eventId: mensDoublesId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 2: Men's Doubles (MALE) should accept 'MALE' participants with UNGROUPED status
  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantLong.participantId],
    entryStatus: UNGROUPED,
    eventId: mensDoublesId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 3: Women's Doubles (FEMALE) should accept 'F' participants with UNGROUPED status
  result = tournamentEngine.addEvent({
    event: { eventName: "Women's Doubles", eventType: DOUBLES, gender: FEMALE },
  });
  expect(result.success).toEqual(true);
  const womensDoublesId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantShort.participantId],
    entryStatus: UNGROUPED,
    eventId: womensDoublesId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 4: Women's Doubles (FEMALE) should accept 'FEMALE' participants with UNGROUPED status
  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantLong.participantId],
    entryStatus: UNGROUPED,
    eventId: womensDoublesId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(1);

  // Test 5: Men's Doubles with short gender 'M' should accept both 'M' and 'MALE' participants
  result = tournamentEngine.addEvent({
    event: { eventName: "Men's Doubles Short", eventType: DOUBLES, gender: MALE_ABBR },
  });
  expect(result.success).toEqual(true);
  const mensDoublesShortId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantShort.participantId, maleParticipantLong.participantId],
    entryStatus: UNGROUPED,
    eventId: mensDoublesShortId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(2);

  // Test 6: Women's Doubles with short gender 'F' should accept both 'F' and 'FEMALE' participants
  result = tournamentEngine.addEvent({
    event: { eventName: "Women's Doubles Short", eventType: DOUBLES, gender: FEMALE_ABBR },
  });
  expect(result.success).toEqual(true);
  const womensDoublesShortId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantShort.participantId, femaleParticipantLong.participantId],
    entryStatus: UNGROUPED,
    eventId: womensDoublesShortId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(2);

  // Test 7: Cross-gender validation - 'F' in Men's Doubles should fail
  result = tournamentEngine.addEvent({
    event: { eventName: "Men's Doubles Cross", eventType: DOUBLES, gender: MALE },
  });
  expect(result.success).toEqual(true);
  const mensCrossId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipantShort.participantId],
    entryStatus: UNGROUPED,
    eventId: mensCrossId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(1);

  // Test 8: Cross-gender validation - 'MALE' in Women's Doubles should fail
  result = tournamentEngine.addEvent({
    event: { eventName: "Women's Doubles Cross", eventType: DOUBLES, gender: FEMALE },
  });
  expect(result.success).toEqual(true);
  const womensCrossId = result.event.eventId;

  result = tournamentEngine.addEventEntries({
    participantIds: [maleParticipantLong.participantId],
    entryStatus: UNGROUPED,
    eventId: womensCrossId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(1);
});
