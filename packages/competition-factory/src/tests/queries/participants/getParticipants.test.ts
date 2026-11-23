import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as tools from '@Assemblies/tools';
import { expect, it, test } from 'vitest';

// constants and fixtures
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SINGLES } from '@Constants/eventConstants';
import { countries } from '@Fixtures/countryData';

const privacyPolicy = {
  [POLICY_TYPE_PARTICIPANT]: {
    policyName: 'Participant Privacy Policy',
    participant: {
      individualParticipants: {
        participantName: true,
        participantOtherName: true,
        participantId: true,
        participantRole: true,
        participantStatus: true,
        representing: true,
        participantType: true,
        person: {
          nationalityCode: true,
          otherNames: true,
          sex: false,
          standardFamilyName: true,
          standardGivenName: true,
        },
      },
      individualParticipantIds: true,
      participantName: true,
      participantOtherName: true,
      participantId: true,
      participantRole: true,
      participantStatus: true,
      representing: true,
      participantType: true,
      person: {
        nationalityCode: true,
        otherNames: true,
        sex: false,
        standardFamilyName: true,
        standardGivenName: true,
      },
    },
  },
};

it('can add ISO country codes to persons', () => {
  const isoWithIOC = countries.filter(({ ioc }) => ioc).map(({ iso }) => iso);
  const participantsProfile = {
    participantsCount: 1,
    participantType: PAIR,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    withIndividualParticipants: { person: true, participantName: true },
    withIOC: true,
  });
  expect(participants.length).toEqual(3);

  const pairParticipant = participants.find(({ participantType }) => participantType === PAIR);
  expect(Object.keys(pairParticipant.individualParticipants[0]).length).toEqual(2);
  const persons = participants
    .map((participant) => participant.person || participant.individualParticipants.map(({ person }) => person))
    .flat();
  persons.forEach((person) => {
    if (isoWithIOC.includes(person.nationalityCode)) expect(person.iocNationalityCode).not.toBeUndefined();
    expect(person.countryName).not.toBeUndefined();
  });
});

it('can retrieve tournament participants', () => {
  const participantsProfile = {
    participantsCount: 100,
    participantType: PAIR,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });
  tournamentEngine.setState(tournamentRecord);

  let { participants } = tournamentEngine.getParticipants();
  expect(participants.length).toEqual(300);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }));
  expect(participants.length).toEqual(200);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }));
  expect(participants.length).toEqual(100);
  expect(participants[0].individualParticipants).toBeUndefined();

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
    withIndividualParticipants: true,
  }));
  expect(participants.length).toEqual(100);
  expect(participants[0].individualParticipants.length).toEqual(2);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
  }));
  expect(participants.length).toEqual(300);
});

test('accessorValues can filter participants by sex', () => {
  const participantsProfile = {
    nationalityCodesCount: 10,
    participantsCount: 100,
    sex: FEMALE,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });
  tournamentEngine.setState(tournamentRecord);

  const accessorValues = [{ accessor: 'person.sex', value: MALE }];
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL], accessorValues },
  });
  expect(participants.length).toEqual(0);
});

it('can accept a privacy policy to filter tournament participants attributes', () => {
  const participantsProfile = {
    nationalityCodesCount: 10,
    participantsCount: 100,
    participantType: PAIR,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });
  tournamentEngine.setState(tournamentRecord);

  let { participants } = tournamentEngine.getParticipants();

  const participantTypes = participants.reduce(
    (types, participant) =>
      types.includes(participant.participantType) ? types : types.concat(participant.participantType),
    [],
  );
  expect(participantTypes.length).toEqual(2);

  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }));
  const participantGenders = participants.reduce(
    (genders, participant) =>
      genders.includes(participant.person.sex) ? genders : genders.concat(participant.person.sex),
    [],
  );
  expect(participantGenders.length).toEqual(2);

  let personAttributes = Object.keys(participants[0].person).sort();
  expect(personAttributes).toEqual([
    'addresses',
    'extensions',
    'nationalityCode',
    'personId',
    'sex',
    'standardFamilyName',
    'standardGivenName',
  ]);

  // first filter for only MALE participants and capture the count
  // this will change for every test run since gendered particpants are genderated randomly
  let accessorValues = [{ accessor: 'person.sex', value: MALE }];
  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL], accessorValues },
  }));
  const maleParticpantsCount = participants.length;

  // check that the privacy policy has not removed the gender/sex until after filtering has occurred
  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL], accessorValues },
    policyDefinitions: privacyPolicy,
  }));
  expect(participants.length).toEqual(maleParticpantsCount);

  personAttributes = Object.keys(participants[0].person);
  expect(personAttributes).toEqual(['standardFamilyName', 'standardGivenName', 'nationalityCode']);

  accessorValues = [
    // this only specifies that at least one if the individualParticipants must be MALE
    { accessor: 'individualParticipants.person.sex', value: MALE },
  ];
  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR], accessorValues },
    withIndividualParticipants: true,
  }));

  participants.forEach((participant) => {
    const individualGenders = participant.individualParticipants.map(({ person }) => person.sex);
    expect(individualGenders.includes(MALE)).toEqual(true);
  });

  // now apply privacyPolicy and filter out gender
  ({ participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR], accessorValues },
    policyDefinitions: privacyPolicy,
    withIndividualParticipants: true,
  }));
  participants.forEach((participant) => {
    expect(participant.individualParticipants.length).toEqual(2);
    participant.individualParticipants.forEach((individual) => {
      expect(Object.keys(individual.person).length).toBeGreaterThan(0);
      expect(individual.person.sex).toBeUndefined();
    });
  });
});

it('can filter by entries', () => {
  const participantsCount = 64;
  const participantsProfile = { participantsCount };
  const drawSize = 16;
  const eventProfiles = [
    {
      eventName: 'U18 Male Doubles',
      drawProfiles: [{ drawSize }],
      gender: MALE,
    },
  ];
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    setState: true,
    eventProfiles,
  });

  let { participants } = tournamentEngine.getParticipants({
    participantFilters: { eventIds: [eventId] },
  });

  expect(participants.length).toEqual(drawSize);

  ({ participants } = tournamentEngine.getParticipants({ participantFilters: { drawEntryStatuses: true } }));
  expect(participants.length).toEqual(drawSize);

  ({ participants } = tournamentEngine.getParticipants({ participantFilters: { eventEntryStatuses: true } }));
  expect(participants.length).toEqual(drawSize);

  const newEventId = tools.UUID();
  const event = { eventType: SINGLES, eventId: newEventId };

  let result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);

  const participantIds = tournamentRecord.participants.map((p) => p.participantId);
  tournamentEngine.addEventEntries({ eventId: newEventId, participantIds });

  ({ participants } = tournamentEngine.getParticipants({ participantFilters: { eventEntryStatuses: true } }));

  // because the draw is gendered, 16 additional unique participants are generated
  const totalExpectedParticipants = participantsCount + drawSize;
  expect(participants.length).toEqual(totalExpectedParticipants);

  ({ participants } = tournamentEngine.getParticipants({ participantFilters: { drawEntryStatuses: true } }));
  expect(participants.length).toEqual(drawSize);

  ({ participants } = tournamentEngine.getParticipants({ participantFilters: { positionedParticipants: true } }));
  expect(participants.length).toEqual(drawSize);

  ({ participants } = tournamentEngine.getParticipants({ participantFilters: { positionedParticipants: false } }));

  expect(participants.length).toEqual(totalExpectedParticipants - drawSize);
});
