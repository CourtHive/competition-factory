import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { CANNOT_MODIFY_PARTICIPANT_TYPE } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { MALE } from '@Constants/genderConstants';

tournamentEngine.devContext(true);

it('can modify PAIR participants', () => {
  const participantsProfile = {
    participantsCount: 10,
    participantType: PAIR,
    sex: MALE,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  expect(individualParticipants.length).toEqual(20);

  const individualParticipant = individualParticipants[0];
  const person = {
    standardFamilyName: 'Sampras',
    standardGivenName: 'Pete',
    nationalityCode: 'USA',
  };
  const updatedIndividualParticipant = { ...individualParticipant, person };
  let result = tournamentEngine.modifyParticipant({
    participant: updatedIndividualParticipant,
  });
  expect(result.success).toEqual(true);
  expect(result.participant.participantName).toEqual(`${person.standardGivenName} ${person.standardFamilyName}`);

  const secondIndividual = individualParticipants[0];
  const updatedSecondIndividual = {
    ...secondIndividual,
    participantOtherName: 'Other',
  };
  result = tournamentEngine.modifyParticipant({
    participant: updatedSecondIndividual,
  });
  expect(result.success).toEqual(true);
  expect(result.participant.participantOtherName).toEqual('Other');

  const { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  expect(pairParticipants.length).toEqual(10);
  const pairParticipant = pairParticipants[0];

  const newIndividualParticipant = individualParticipants.filter(
    ({ participantId }) => !pairParticipant.individualParticipantIds.includes(participantId),
  )[0];

  const updatedPairParticipant = makeDeepCopy(pairParticipant);
  const individualParticipantIds = updatedPairParticipant.individualParticipantIds;
  individualParticipantIds[0] = newIndividualParticipant.participantId;

  result = tournamentEngine.modifyParticipant({
    participant: updatedPairParticipant,
  });
  expect(result.success).toEqual(true);

  // split the previous and new participantNames and expect the overlap to = 1
  expect(
    intersection(pairParticipant.participantName.split('/'), result.participant.participantName.split('/')).length,
  ).toEqual(1);

  expect(
    intersection(pairParticipant.individualParticipantIds, result.participant.individualParticipantIds).length,
  ).toEqual(1);

  const modifiedSecondIndividual = makeDeepCopy(updatedSecondIndividual);
  const nationalityCode = modifiedSecondIndividual.person.nationalityCode;

  modifiedSecondIndividual.person.nationalityCode = 'XXX';
  result = tournamentEngine.modifyParticipant({
    participant: modifiedSecondIndividual,
  });
  // fail silently, do not apply invalid nationalityCode
  expect(result.participant.person.nationalityCode).toEqual(nationalityCode);

  modifiedSecondIndividual.person.nationalityCode = 'USA';
  result = tournamentEngine.modifyParticipant({
    participant: modifiedSecondIndividual,
  });
  expect(result.participant.person.nationalityCode).toEqual('USA');

  result = tournamentEngine.modifyParticipant({
    participant: {
      participantId: individualParticipantIds[0],
      person: { tennisId: 'ABC123' },
    },
  });
  expect(result.participant.person.tennisId).toEqual('ABC123');

  const participant = tournamentEngine.findParticipant({ participantId: individualParticipantIds[0] }).participant;
  expect(participant.person.tennisId).toEqual('ABC123');
});

it('can modify TEAM participants', () => {
  const participantsProfile = {
    participantsCount: 10,
    participantType: TEAM,
    sex: MALE,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsProfile });

  tournamentEngine.setState(tournamentRecord);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(teamParticipants.length).toEqual(10);

  const firstTeam = teamParticipants[0];
  const individualParticipantIds = firstTeam.individualParticipantIds;
  const reversedIndividualParticipants = makeDeepCopy(individualParticipantIds, false, true).reverse();

  expect(individualParticipantIds).not.toEqual(reversedIndividualParticipants);
  expect(individualParticipantIds[0]).toEqual(
    reversedIndividualParticipants[reversedIndividualParticipants.length - 1],
  );
  const result = tournamentEngine.modifyParticipant({
    participant: {
      individualParticipantIds: reversedIndividualParticipants,
      participantId: firstTeam.participantId,
    },
  });

  expect(reversedIndividualParticipants).toEqual(result.participant.individualParticipantIds);
});

it('will not modify participantType', () => {
  const participantsProfile = {
    participantsCount: 10,
    participantType: TEAM,
    sex: MALE,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(teamParticipants.length).toEqual(10);

  const firstTeam = teamParticipants[0];
  const result = tournamentEngine.modifyParticipant({
    participant: {
      participantId: firstTeam.participantId,
      participantType: PAIR,
    },
  });
  expect(result.error).toEqual(CANNOT_MODIFY_PARTICIPANT_TYPE);
});
