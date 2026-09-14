import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { PAIR } from '@Constants/participantConstants';

it('can generate an event with draw independent of a tournamentRecord', () => {
  const drawSize = 32;
  const drawProfile = { drawSize };
  const { drawDefinition, event, success } = mocksEngine.generateEventWithDraw({ drawProfile });
  expect(success).toEqual(true);
  expect(event.entries.length).toEqual(drawSize);
  expect(drawDefinition.entries.length).toEqual(drawSize);
});

it('can use drawProfiles to generate gendered SINGLES event', () => {
  const participantsCount = 64;
  const drawSize = 32;
  const drawProfiles = [{ drawSize, gender: MALE, eventType: SINGLES }];
  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    drawProfiles,
  });
  expect(result.error).toBeUndefined();
  const { eventIds, tournamentRecord } = result;
  tournamentEngine.setState(tournamentRecord);

  let { participants } = tournamentEngine.getParticipants();

  expect(participants.length).toEqual(participantsCount + drawSize);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { eventIds },
  }));

  expect(participants.length).toEqual(drawSize);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { positionedParticipants: true },
  }));

  expect(participants.length).toEqual(drawSize);

  const genders = participants.reduce(
    (genders, participant) =>
      genders.includes(participant.person?.sex) ? genders : genders.concat(participant.person?.sex),
    [],
  );
  expect(genders).toEqual([MALE]);
});

it('can use eventProfiles to generate gendered SINGLES event', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      gender: MALE,
      eventType: SINGLES,
      uniqueParticipants: true,
    },
  ];
  const eventProfiles = [{ drawProfiles }];
  const result = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });
  expect(result.error).toBeUndefined();

  const { eventIds, tournamentRecord } = result;
  tournamentEngine.setState(tournamentRecord);

  let { participants } = tournamentEngine.getParticipants();

  expect(participants.length).toEqual(32);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { eventIds },
  }));

  expect(participants.length).toEqual(32);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { positionedParticipants: true },
  }));

  expect(participants.length).toEqual(32);

  const genders = participants.reduce(
    (genders, participant) =>
      genders.includes(participant.person?.sex) ? genders : genders.concat(participant.person?.sex),
    [],
  );
  expect(genders).toEqual([MALE]);
});

it('can use drawProfiles to generate gendered DOUBLES event', () => {
  const drawProfiles = [
    { participantsCount: 32, eventType: DOUBLES, gender: MALE },
    { participantsCount: 32, eventType: DOUBLES, gender: FEMALE },
  ];

  let result = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });
  expect(result.error).toBeUndefined();

  result = tournamentEngine.getParticipants({
    participantFilters: { positionedParticipants: true, participantTypes: [PAIR] },
    withIndividualParticipants: true,
    returnParticipantMap: true,
  });
  expect(result.participants[0].individualParticipants.length).toEqual(2);
  // Do not expect the individualParticipant to be included in the participantMap
  expect(result.participantMap[result.participants[0].participantId].participant.individualParticipant).toBeUndefined();
});
