import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { INDIVIDUAL } from '@Constants/participantConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import {
  INVALID_ENTRY_STATUS,
  MISSING_EVENT,
  PARTICIPANT_ENTRY_NOT_FOUND,
  PARTICIPANT_NOT_FOUND_IN_STAGE,
} from '@Constants/errorConditionConstants';

it('can promote alternates', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
    },
  ];
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  let {
    event: { entries },
  } = tournamentEngine.getEvent({ eventId });
  let alternates = entries.filter((entry) => entry.entryStatus === ALTERNATE);
  expect(alternates.length).toEqual(2);

  let { participantId } = alternates[0];

  let result = tournamentEngine.promoteAlternates({
    participantIds: [participantId],
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.promoteAlternate({
    participantId,
  });
  expect(result.error).toEqual(MISSING_EVENT);

  ({
    event: { entries },
  } = tournamentEngine.getEvent({ eventId }));
  alternates = entries.filter((entry) => entry.entryStatus === ALTERNATE);
  expect(alternates.length).toEqual(1);

  result = tournamentEngine.promoteAlternate({
    participantId,
    eventId,
  });
  expect(result.error).toEqual(INVALID_ENTRY_STATUS);

  ({ participantId } = alternates[0]);

  result = tournamentEngine.promoteAlternate({
    stageSequence: 4,
    participantId,
    eventId,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND_IN_STAGE);

  result = tournamentEngine.promoteAlternate({
    participantId,
    eventId,
  });
  expect(result.success).toEqual(true);

  ({
    event: { entries },
  } = tournamentEngine.getEvent({ eventId }));
  alternates = entries.filter((entry) => entry.entryStatus === ALTERNATE);
  expect(alternates.length).toEqual(0);

  result = tournamentEngine.promoteAlternate({
    participantId: 'invalid',
    eventId,
  });
  expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);

  result = tournamentEngine.promoteAlternate({
    participantId,
    eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_ENTRY_STATUS);
});

test('entries with no entryStage can be promoted', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, generate: false }],
  });

  tournamentEngine.setState(tournamentRecord);
  const participant = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  let result = tournamentEngine.addParticipants({
    participants: [participant],
    returnParticipants: true,
  });
  expect(result.success).toEqual(true);

  const participantId = result.participants[0].participantId;

  const participantIds = [participantId];
  // entries can be added with no entryStage
  result = tournamentEngine.addEventEntries({
    entryStatus: ALTERNATE,
    participantIds,
    entryStage: '',
    drawId,
  });
  expect(result.success).toEqual(true);

  // it can get event by drawId when no drawDefinition is present and promote and alternate with no entryStage
  const { event } = tournamentEngine.getEvent({ drawId });
  const alternateEntry = event.entries.find(({ entryStatus }) => entryStatus === ALTERNATE);
  expect(alternateEntry.entryStage).toBeUndefined();

  result = tournamentEngine.promoteAlternate({
    participantId: alternateEntry.participantId,
    eventId: event.eventId,
  });
  expect(result.success).toEqual(true);
});
