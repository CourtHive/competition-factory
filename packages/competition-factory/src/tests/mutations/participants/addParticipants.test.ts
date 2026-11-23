import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import { UUID } from '@Tools/UUID';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import {
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ROLE,
  MISSING_PERSON_DETAILS,
} from '@Constants/errorConditionConstants';

it('can add multiple participants at once', () => {
  let result = tournamentEngine.newTournamentRecord();
  expect(result?.success).toEqual(true);
  const participantId = UUID();

  let participant: any = {
    participantId,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipants({
    participants: [participant],
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);

  participant = {
    participantId,
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipants({
    participants: [participant],
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ROLE);

  participant = {
    participantId,
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipants({
    participants: [participant],
  });
  expect(result.error).toEqual(MISSING_PERSON_DETAILS);

  participant = {
    participantId,
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipants({
    participants: [participant],
  });
  expect(result.success).toEqual(true);

  participant = {
    participantId,
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipants({
    participants: [participant],
  });
  expect(result.success).toEqual(true);
  expect(result.info).not.toBeUndefined();

  const participant2 = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipants({
    participants: [participant, participant2],
  });
  expect(result.success).toEqual(true);
  expect(result.notAdded.length).toEqual(1);
  expect(result.info).not.toBeUndefined();

  let { participants } = tournamentEngine.getParticipants();
  expect(participants.length).toEqual(2);

  const individualParticipantIds = participants.map((participant) => participant.participantId);

  const participant3 = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds,
  };

  result = tournamentEngine.addParticipants({
    participants: [participant, participant2, participant3],
  });
  expect(result.success).toEqual(true);
  expect(result.notAdded.length).toEqual(2);

  ({ participants } = tournamentEngine.getParticipants());
  expect(participants.length).toEqual(3);
});
