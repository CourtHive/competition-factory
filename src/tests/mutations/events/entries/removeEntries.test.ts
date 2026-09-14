import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { MALE } from '@Constants/genderConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  INVALID_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

test('event entries are only removed when not placed in draw structures', () => {
  const gender = MALE;
  const drawProfiles = [{ drawSize: 16, gender, alternatesCount: 2 }];
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 32, sex: gender },
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const participant = {
    participantRole: COMPETITOR,
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
      sex: gender,
    },
  };

  let result = tournamentEngine.addParticipant({
    returnParticipant: true,
    participant,
  });
  expect(result.success).toEqual(true);
  const participantId = result.participant.participantId;

  result = tournamentEngine.addEventEntries({
    participantIds: [participantId],
    eventId,
  });
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants();

  if (gender) {
    participants.forEach((participant) => {
      expect(participant.person.sex).toEqual(gender);
    });
  }

  const participantIds = participants.map(({ participantId }) => participantId);
  expect(participantIds.includes(participantId)).toEqual(true);

  let { event } = tournamentEngine.getEvent({ eventId });
  let { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  let { drawEntries, drawDefinition } = flightProfile.flights[0];
  expect(drawDefinition.entries.length).toEqual(drawEntries.length);

  // event has an additional entry
  expect(event.entries.length).toEqual(drawEntries.length + 3);

  result = tournamentEngine.checkValidEntries({ eventId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.checkValidEntries({
    participants,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeEventEntries({
    eventId,
  });
  expect(result.participantIdsRemoved.length).toEqual(0);
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeEventEntries({
    participantIds: [participantId],
    eventId,
  });
  expect(result.success).toEqual(true);

  ({ event } = tournamentEngine.getEvent({ eventId }));
  expect(event.entries.length).toEqual(drawEntries.length + 2);

  const drawEntriesCount = drawEntries.length;

  // now remove an alternate entry that is present in event, flight and drawDefinition
  const alternateParticipantIds = event.entries
    .filter(({ entryStatus }) => entryStatus === ALTERNATE)
    .map(getParticipantId);
  const alternateParticipantId = alternateParticipantIds[0];

  result = tournamentEngine.removeEventEntries({
    participantIds: [alternateParticipantId],
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeEventEntries({
    participantIds: [undefined],
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_ID);

  // now check the entry is removed from flight and draw entries as well
  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  ({ drawEntries, drawDefinition } = flightProfile.flights[0]);
  expect(drawDefinition.entries.length).toEqual(drawEntries.length);

  expect(drawEntries.length).toEqual(drawEntriesCount);

  ({ event } = tournamentEngine.getEvent({ eventId }));
  expect(event.entries.length).toEqual(drawEntries.length + 1);

  const enteredParticipantIds = drawEntries
    .filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE)
    .map(getParticipantId);
  const enteredParticipantId = enteredParticipantIds[0];
  result = tournamentEngine.removeEventEntries({
    participantIds: [enteredParticipantId],
    eventId,
  });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
});
