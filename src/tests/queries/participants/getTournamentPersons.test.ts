import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import PARTICIPANT_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { INDIVIDUAL } from '@Constants/participantConstants';

it('can retrieve and modify tournament persons', () => {
  let tournamentPersons = tournamentEngine.getTournamentPersons({
    tournamentRecord: { tournamentId: 'tid' },
  }).tournamentPersons;
  expect(tournamentPersons.length).toEqual(0);

  const participantsProfile = { participantsCount: 100 };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });
  tournamentEngine.setState(tournamentRecord);

  tournamentPersons = tournamentEngine.getTournamentPersons({
    participantFilters: { participantRoles: [COMPETITOR] },
  }).tournamentPersons;
  expect(tournamentPersons?.length).toBeGreaterThan(0);
  expect(tournamentPersons[0].participantIds.length).toEqual(1);
  expect(tournamentPersons.length).toEqual(100);

  const targetedParticipantId = tournamentPersons[0].participantIds[0];
  const { participant: targetedParticipant } = tournamentEngine.findParticipant({
    participantId: targetedParticipantId,
  });

  const targetPersonId = 'targetPersonId';
  const updatedParticipant = {
    ...targetedParticipant,
    person: { ...targetedParticipant.person, personId: targetPersonId },
  };

  let result = tournamentEngine.modifyParticipant({
    participant: updatedParticipant,
  });
  expect(result.success).toEqual(true);

  const { participant } = tournamentEngine.findParticipant({
    participantId: targetedParticipantId,
  });

  const person = participant.person;

  expect(person.personId).toEqual(updatedParticipant.person.personId);

  const policyDefinitions = { ...PARTICIPANT_PRIVACY_DEFAULT };

  const personId = updatedParticipant.person.personId;
  result = tournamentEngine.findParticipant({
    personId,
  });

  expect(result.participant.person.personId).toEqual(personId);

  result = tournamentEngine.findParticipant({
    policyDefinitions,
    personId,
  });
  // privacy policy has removed personId
  expect(result.participant.person.personId).toBeUndefined();

  result = tournamentEngine.findParticipant({
    personId: undefined,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  const officialParticipant = {
    participantType: INDIVIDUAL,
    participantRole: OFFICIAL,
    person,
  };

  result = tournamentEngine.addParticipant({
    participant: officialParticipant,
  });
  expect(result.success).toEqual(true);

  tournamentPersons = tournamentEngine.getTournamentPersons({}).tournamentPersons;
  const personWithMultipleRoles = tournamentPersons.find((p) => p.participantIds.length > 1);
  expect(personWithMultipleRoles.participantIds.length).toEqual(2);
  expect(personWithMultipleRoles.personId).toEqual(targetPersonId);
});
