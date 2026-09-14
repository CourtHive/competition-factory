import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import { UUID } from '@Tools/UUID';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ROLE,
  MISSING_PERSON_DETAILS,
  PARTICIPANT_ID_EXISTS,
} from '@Constants/errorConditionConstants';

it('will not add the same participantId twice', () => {
  let result = tournamentEngine.newTournamentRecord();
  expect(result?.success).toEqual(true);

  const participantId = UUID();
  const participant = {
    participantId,
    participantRole: COMPETITOR,
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addParticipant({ participant });
  expect(result.error).toEqual(PARTICIPANT_ID_EXISTS);
});

it('will not add invalid individual participants', () => {
  let result = tournamentEngine.newTournamentRecord();
  expect(result?.success).toEqual(true);

  let participant: any = {
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);

  participant = {
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ROLE);

  participant = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.error).toEqual(MISSING_PERSON_DETAILS);

  participant = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.error).toEqual(MISSING_PERSON_DETAILS);

  participant = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
    },
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.error).toEqual(MISSING_PERSON_DETAILS);

  participant = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.addParticipant({ participant });
  expect(result.success).toEqual(true);
});

it('can add individual and pair participants', () => {
  let result = tournamentEngine.newTournamentRecord();
  expect(result?.success).toEqual(true);

  const participant1 = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  const participant2 = {
    participantType: INDIVIDUAL,
    participantRole: COMPETITOR,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  const individualParticipantIds: string[] = [];
  result = tournamentEngine.addParticipant({
    participant: participant1,
    returnParticipant: true,
  });
  expect(result.success).toEqual(true);
  individualParticipantIds.push(result.participant.participantId);

  result = tournamentEngine.addParticipant({
    participant: participant2,
    returnParticipant: true,
  });
  expect(result.success).toEqual(true);
  individualParticipantIds.push(result.participant.participantId);

  const pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds,
  };
  result = tournamentEngine.addParticipant({ participant: pairParticipant });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.participants.length).toEqual(3);
});

it('will not add invalid PAIR participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
  });
  tournamentEngine.setState(tournamentRecord);

  let pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds: ['abc'],
  };
  let result = tournamentEngine.addParticipant({
    participant: pairParticipant,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.info).not.toBeUndefined();

  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds: ['abc', 'def'],
  };
  result = tournamentEngine.addParticipant({
    participant: pairParticipant,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.info).toBeUndefined();

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  // cannot add 3 individualParticipantIds for PAIR
  const threePrticipantIds = individualParticipants.slice(0, 3).map((participant) => participant.participantId);
  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds: threePrticipantIds,
  };
  result = tournamentEngine.addParticipant({
    participant: pairParticipant,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.info).not.toBeUndefined();

  // individualParticipants instead of individualParticipantIds
  const participants = individualParticipants.slice(0, 2);
  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds: participants,
  };
  result = tournamentEngine.addParticipant({
    participant: pairParticipant,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  // expect success
  const individualParticipantIds = individualParticipants.slice(0, 2).map((participant) => participant.participantId);
  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds,
  };
  result = tournamentEngine.addParticipant({
    participant: pairParticipant,
    returnParticipant: true,
  });
  expect(result.success).toEqual(true);
  const pairParticipantId = result.participant.participantId;

  const { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  const pairParticipantIds = pairParticipants.map((participant) => participant.participantId);
  expect(pairParticipantIds.includes(pairParticipantId)).toEqual(true);

  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds,
  };
  result = tournamentEngine.addParticipant({
    participant: pairParticipant,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getParticipantMembership({
    participantId: individualParticipantIds[0],
  });
  expect(result[PAIR].length).toEqual(1);
  expect(result[PAIR][0].participantId).toEqual(pairParticipantId);

  // Now attempt add again but this time allowDuplicates
  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds,
  };
  result = tournamentEngine.addParticipant({
    participant: pairParticipant,
    allowDuplicateParticipantIdPairs: true,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getParticipantMembership({
    participantId: individualParticipantIds[0],
  });
  expect(result[PAIR].length).toEqual(2);
  expect(result[PAIR][0].participantId).toEqual(pairParticipantId);

  // now attempt to add pair participant with one individualPartiicipantId
  // allowing override
  pairParticipant = {
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds: [individualParticipantIds[0]],
  };
  result = tournamentEngine.addParticipant({
    allowDuplicateParticipantIdPairs: true,
    participant: pairParticipant,
    returnParticipant: true,
    pairOverride: true,
  });
  expect(result.success).toEqual(true);
  const pairParticipantSingleIndividual = result.participant;

  result = tournamentEngine.getParticipantMembership({
    participantId: individualParticipantIds[0],
  });
  expect(result[PAIR].length).toEqual(3);
  expect(result[PAIR][0].participantId).toEqual(pairParticipantId);

  result = tournamentEngine.getPairedParticipant({
    participantIds: [individualParticipantIds[0]],
  });
  expect(result.participant.participantId).toEqual(pairParticipantSingleIndividual.participantId);
});
