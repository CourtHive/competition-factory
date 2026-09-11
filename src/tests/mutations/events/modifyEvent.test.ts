import { stringSort } from '@Functions/sorters/stringSort';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { addDays } from '@Tools/dateTime';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and types
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FEMALE, MALE, ANY } from '@Constants/genderConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

// Fixtures
import { competitionFormats } from '@Fixtures/scoring/competitionFormats';

it('supports modifying event gender, name and eventType', () => {
  const drawSize = 16;
  const startDate = '2024-02-01';
  const endDate = '2024-02-29';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawSize, uniqueParticipants: true }],
        eventType: SINGLES,
        eventName: ANY,
        eventId: ANY,
        gender: ANY,
      },
      {
        drawProfiles: [{ drawSize, uniqueParticipants: true }],
        eventType: SINGLES,
        eventName: FEMALE,
        eventId: FEMALE,
        gender: FEMALE,
      },
      {
        drawProfiles: [{ drawSize, uniqueParticipants: true }],
        eventType: SINGLES,
        eventName: MALE,
        eventId: MALE,
        gender: MALE,
      },
    ],
    setState: true,
    startDate,
    endDate,
  });

  let result = tournamentEngine.modifyEvent();
  expect(result.error).toEqual(EVENT_NOT_FOUND);
  result = tournamentEngine.modifyEvent({ eventId: ANY });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.modifyEvent({
    eventId: ANY,
    eventUpdates: { startDate: addDays(startDate), endDate: addDays(endDate, -1) },
  });
  expect(result.success).toEqual(true);
  const event = tournamentEngine.getEvent({ eventId: ANY }).event;
  expect(event.startDate).toEqual(addDays(startDate));
  expect(event.endDate).toEqual(addDays(endDate, -1));

  const participants = tournamentEngine.getParticipants({
    withEvents: true,
  }).participants;

  const profiles = [
    {
      genderModification: { ANY: true, MALE: false, FEMALE: false },
      genders: [FEMALE, MALE],
      eventId: ANY,
    },
    {
      genderModification: { ANY: true, MALE: true, FEMALE: false },
      genders: [MALE],
      eventId: MALE,
    },
    {
      genderModification: { ANY: true, MALE: false, FEMALE: true },
      genders: [FEMALE],
      eventId: FEMALE,
    },
  ];

  profiles.forEach((profile) => {
    const event = tournamentEngine.getEvent(profile).event;
    const eventId = event.eventId;

    expect(event.eventName).toEqual(eventId);
    const enteredParticipantIds = event.entries.map(({ participantId }) => participantId);
    const enteredParticipantGenders = unique(
      participants
        .filter(({ participantId }) => enteredParticipantIds.includes(participantId))
        .map(({ person }) => person.sex),
    ).sort(stringSort);

    expect(enteredParticipantGenders).toEqual(profile.genders);

    Object.keys(profile.genderModification).forEach((gender) => {
      const expectation = profile.genderModification[gender];
      const updatedEventName = `${eventId}-modified`;
      const result = tournamentEngine.modifyEvent({
        eventUpdates: { eventName: updatedEventName, gender },
        eventId,
      });
      if (!!result.success !== expectation) console.log({ result, profile, expectation });
      expect(!!result.success).toEqual(expectation);
      const updatedEvent = tournamentEngine.getEvent(profile).event;
      expect(updatedEvent.eventName).toEqual(updatedEventName);
    });

    const result = tournamentEngine.modifyEvent({
      eventUpdates: { eventType: DOUBLES },
      eventId,
    });
    expect(result.error).not.toBeUndefined();
  });
});

it('supports attaching, replacing, and clearing competitionFormat on an event', () => {
  const eventId = 'cf-modify';
  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Test Event', eventType: SINGLES }],
    setState: true,
  });

  // Initially absent
  let event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.competitionFormat).toBeUndefined();

  // Attach INTENNSE_STANDARD
  let result = tournamentEngine.modifyEvent({
    eventUpdates: { competitionFormat: competitionFormats.INTENNSE_STANDARD as any },
    eventId,
  });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.competitionFormat?.competitionFormatId).toEqual(
    competitionFormats.INTENNSE_STANDARD.competitionFormatId,
  );

  // Replace with TENNIS_STANDARD
  result = tournamentEngine.modifyEvent({
    eventUpdates: { competitionFormat: competitionFormats.TENNIS_STANDARD as any },
    eventId,
  });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.competitionFormat?.competitionFormatId).toEqual(competitionFormats.TENNIS_STANDARD.competitionFormatId);

  // Clear with null
  result = tournamentEngine.modifyEvent({
    eventUpdates: { competitionFormat: null },
    eventId,
  });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.competitionFormat).toBeUndefined();
});

// The origin of an event is a tournament in ANOTHER organisation's system. Its
// tournamentId is that organisation's and must never be confused with the carrying
// record's — a single record can hold events sanctioned by several organisations.
it('supports setting, replacing, and clearing eventOtherIds on an event', () => {
  const eventId = 'origin-modify';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Sanctioned Event', eventType: SINGLES }],
    nonRandom: 1,
    setState: true,
  });

  let event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.eventOtherIds).toBeUndefined();

  const origin = { organisationId: 'ITA', tournamentId: 'ita-4471', eventId: 'ita-ev-9', isOrigin: true };
  let result: any = tournamentEngine.modifyEvent({ eventUpdates: { eventOtherIds: [origin] }, eventId });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.eventOtherIds).toEqual([origin]);
  // the origin's tournamentId is the ORIGIN organisation's, not the carrying record's
  expect(event.eventOtherIds?.[0].tournamentId).not.toEqual(tournamentRecord.tournamentId);

  // a copy-back to a second organisation appends its id — the array is replaced wholesale
  const copyBack = { organisationId: 'USTA', tournamentId: 'usta-88', eventId: 'usta-ev-2' };
  result = tournamentEngine.modifyEvent({ eventUpdates: { eventOtherIds: [origin, copyBack] }, eventId });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.eventOtherIds).toHaveLength(2);
  expect(event.eventOtherIds?.filter((otherId) => otherId.isOrigin)).toHaveLength(1);

  result = tournamentEngine.modifyEvent({ eventUpdates: { eventOtherIds: null }, eventId });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.eventOtherIds).toBeUndefined();
});
