import { generatePersonData } from '@Assemblies/generators/mocks/generatePersonData';
import { setDevContext } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { generateRange } from '@Tools/arrays';
import { expect, it, test } from 'vitest';
import { UUID } from '@Tools/UUID';

// constants
import { FEMALE, MALE } from '@Constants/genderConstants';
import { PAIR } from '@Constants/participantConstants';
import { UTR, WTN } from '@Constants/ratingConstants';

it('can generate unique participants', () => {
  const defaultPersonData = generatePersonData().personData;
  const participantsCount = (defaultPersonData?.length ?? 0) + 10;
  const { participants } = mocksEngine.generateParticipants({ participantsCount });
  expect(participants[participants.length - 1].person.firstName).not.toEqual('GivenName');
});

it('can use idPrefix when generating participantIds', () => {
  const { participants } = mocksEngine.generateParticipants({
    participantsCount: 20,
    idPrefix: 'P',
  });

  participants.forEach(({ participantId }, i) => expect(participantId).toEqual(`P-I-${i}`));
});

test('generateTournamentRecord passes participantsProfile.personIds', () => {
  const personIds = generateRange(0, 9).map(() => UUID());
  const participantsProfile = {
    participantsCount: 10,
    personIds,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile,
  });
  expect(tournamentRecord.participants[0].person.personId).toEqual(personIds[0]);
});

it('can generate use pre-defined personIds', () => {
  const defaultPersonData = generatePersonData().personData;
  const participantsCount = (defaultPersonData?.length ?? 0) + 10;
  const personIds = generateRange(0, 9).map(() => UUID());
  const { participants } = mocksEngine.generateParticipants({
    participantsCount,
    personIds,
  });
  expect(participants[participants.length - 1].person.firstName).not.toEqual('GivenName');
  expect(participants[0].person.personId).toEqual(personIds[0]);
});

it('can generate sexed participants', () => {
  let { participants } = mocksEngine.generateParticipants({
    participantsCount: 10,
    sex: FEMALE,
  });
  let sexes = participants.reduce((sexes, participant) => {
    const { sex } = participant.person;
    if (!sexes.includes(sex)) sexes.push(sex);
    return sexes;
  }, []);
  expect(sexes).toEqual([FEMALE]);

  ({ participants } = mocksEngine.generateParticipants({
    participantsCount: 10,
    sex: MALE,
  }));
  sexes = participants.reduce((sexes, participant) => {
    const { sex } = participant.person;
    if (!sexes.includes(sex)) sexes.push(sex);
    return sexes;
  }, []);
  expect(sexes).toEqual([MALE]);

  ({ participants } = mocksEngine.generateParticipants({
    participantsCount: 100,
  }));
  sexes = participants.reduce((sexes, participant) => {
    const { sex } = participant.person;
    if (!sexes.includes(sex)) sexes.push(sex);
    return sexes;
  }, []);
  expect(sexes.sort()).toEqual([FEMALE, MALE]);

  ({ participants } = mocksEngine.generateParticipants({
    participantsCount: 20,
    participantType: PAIR,
    inContext: true,
    sex: MALE,
  }));
  sexes = participants
    .filter((p) => p.participantType === PAIR)
    .reduce((sexes, participant) => {
      const pairSexes = participant.individualParticipants
        .map((p) => p.person.sex)
        .sort()
        .join('/');
      if (!sexes.includes(pairSexes)) sexes.push(pairSexes);
      return sexes;
    }, []);
  expect(sexes).toEqual([`${MALE}/${MALE}`]);

  ({ participants } = mocksEngine.generateParticipants({
    participantsCount: 20,
    participantType: PAIR,
    inContext: true,
    sex: FEMALE,
  }));

  sexes = participants
    .filter((p) => p.participantType === PAIR)
    .reduce((sexes, participant) => {
      const pairSexes = participant.individualParticipants
        .map((p) => p.person.sex)
        .sort()
        .join('/');
      if (!sexes.includes(pairSexes)) sexes.push(pairSexes);
      return sexes;
    }, []);
  expect(sexes).toEqual([`${FEMALE}/${FEMALE}`]);

  ({ participants } = mocksEngine.generateParticipants({
    participantsCount: 200,
    participantType: PAIR,
    inContext: true,
  }));
  sexes = participants
    .filter((p) => p.participantType === PAIR)
    .reduce((sexes, participant) => {
      const pairSexes = participant.individualParticipants
        .map((p) => p.person.sex)
        .sort()
        .join('/');
      if (!sexes.includes(pairSexes)) sexes.push(pairSexes);
      return sexes;
    }, []);
  expect(sexes.sort()).toEqual([`${FEMALE}/${FEMALE}`, `${FEMALE}/${MALE}`, `${MALE}/${MALE}`]);
});

it('can accept custom personData', () => {
  const personData = [
    { firstName: 'Sam', lastName: 'Smith', sex: MALE, nationalityCode: 'CHE' },
    {
      firstName: 'Jennifer',
      lastName: 'Jameson',
      sex: FEMALE,
      nationalityCode: 'IRL',
    },
  ];
  const { participants, error } = mocksEngine.generateParticipants({
    participantsCount: 4,
    withIOC: true,
    personData,
  });
  expect(error).toBeUndefined();
  const samIndex = participants.findIndex(
    ({ person }) => person.standardGivenName === 'Sam' && person.standardFamilyName === 'Smith',
  );
  const jennyIndex = participants.findIndex(
    ({ person }) => person.standardGivenName === 'Jennifer' && person.standardFamilyName === 'Jameson',
  );
  expect([samIndex, jennyIndex].sort((a, b) => a - b)).toEqual([0, 1]);

  expect(participants[0].person.iocNationalityCode).not.toBeUndefined();
  expect(participants[0].person.countryName).not.toBeUndefined();
});

it('can generate participants with both UTR and WTN ratings', () => {
  setDevContext(true);
  const result = mocksEngine.generateParticipants({
    scaleAllParticipants: true,
    participantsCount: 10,
    categories: [
      { ratingType: UTR, ratingMin: 10, ratingMax: 12 },
      { ratingType: WTN, ratingMin: 10, ratingMax: 14 },
    ],
  });
  expect(result.participants[0].timeItems.length).toEqual(2);
});
