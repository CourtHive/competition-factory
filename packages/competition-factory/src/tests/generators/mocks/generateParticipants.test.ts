import { generatePersonData } from '@Assemblies/generators/mocks/generatePersonData';
import { defined } from '@Tests/helpers/defined';
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
  const { participants }: any = mocksEngine.generateParticipants({ participantsCount });
  expect(defined(participants[participants.length - 1].person, 'person').firstName).not.toEqual('GivenName');
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
  expect(defined(defined(tournamentRecord.participants, 'participants')[0].person, 'person').personId).toEqual(
    personIds[0],
  );
});

it('can generate use pre-defined personIds', () => {
  const defaultPersonData = generatePersonData().personData;
  const participantsCount = (defaultPersonData?.length ?? 0) + 10;
  const personIds = generateRange(0, 9).map(() => UUID());
  const { participants }: any = mocksEngine.generateParticipants({
    participantsCount,
    personIds,
  });
  expect(defined(participants[participants.length - 1].person, 'person').firstName).not.toEqual('GivenName');
  expect(defined(participants[0].person, 'person').personId).toEqual(personIds[0]);
});

it('can generate sexed participants', () => {
  let { participants }: any = mocksEngine.generateParticipants({
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
      const pairSexes = defined(participant.individualParticipants, 'individualParticipants')
        .map((p) => defined(p.person, 'person').sex)
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
      const pairSexes = defined(participant.individualParticipants, 'individualParticipants')
        .map((p) => defined(p.person, 'person').sex)
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
      const pairSexes = defined(participant.individualParticipants, 'individualParticipants')
        .map((p) => defined(p.person, 'person').sex)
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
    ({ person }) =>
      defined(person, 'person').standardGivenName === 'Sam' && defined(person, 'person').standardFamilyName === 'Smith',
  );
  const jennyIndex = participants.findIndex(
    ({ person }) =>
      defined(person, 'person').standardGivenName === 'Jennifer' &&
      defined(person, 'person').standardFamilyName === 'Jameson',
  );
  expect([samIndex, jennyIndex].sort((a, b) => a - b)).toEqual([0, 1]);

  expect(defined(participants[0].person, 'person').iocNationalityCode).not.toBeUndefined();
  expect(defined(participants[0].person, 'person').countryName).not.toBeUndefined();
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
  expect(defined(result.participants[0].timeItems, 'timeItems').length).toEqual(2);
});
