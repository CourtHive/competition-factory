import { generateRange, randomMember, randomPop, shuffleArray } from '@Tools/arrays';
import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { definedAttributes } from '@Tools/definedAttributes';
import { generatePersonData } from './generatePersonData';
import { isFemale } from '@Validators/isFemale';
import { dateFromDay } from '@Tools/dateTime';
import { ensureInt } from '@Tools/ensureInt';
import { isMale } from '@Validators/isMale';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { MALE, FEMALE } from '@Constants/genderConstants';
import { countries } from '@Fixtures/countryData';

export function generatePersons(params?) {
  let count = params?.count || 1;
  const { personExtensions, consideredDate, isMock = true, gendersCount, personData, random, category, sex } =
    params ?? {};
  if (Number.isNaN(Number(count))) return { error: INVALID_VALUES };

  const maleCount = gendersCount?.[MALE] || (isMale(sex) && count) || 0;
  const femaleCount = gendersCount?.[FEMALE] || (isFemale(sex) && count) || 0;
  count = Math.max(count, maleCount + femaleCount);
  const defaultCount = count - (maleCount + femaleCount);

  const defaultMalePersonData =
    (maleCount &&
      generatePersonData({
        count: maleCount,
        sex: MALE,
        random,
      }).personData) ||
    [];

  const defaultFemalePersonData =
    (femaleCount &&
      generatePersonData({
        count: femaleCount,
        sex: FEMALE,
        random,
      }).personData) ||
    [];

  const defaultPersonData = [
    ...defaultMalePersonData,
    ...defaultFemalePersonData,
    ...((defaultCount &&
      generatePersonData({
        count: defaultCount,
        random,
      }).personData) ||
      []),
  ];

  let validPersonData = defaultPersonData.filter((person) => !sex || (maleCount && femaleCount) || person.sex === sex);

  const nationalityCodes: string[] = [];

  if (Array.isArray(personData)) {
    const validatedPersonData = personData.filter((person) => {
      if (typeof person.firstName !== 'string') return false;
      if (typeof person.lastName !== 'string') return false;
      if (person.sex && ![MALE, FEMALE].includes(person.sex)) return false;
      if (
        person.nationalityCode &&
        (typeof person.nationalityCode !== 'string' ||
          person.nationalityCode.length > 3 ||
          !countries.some(({ iso, ioc }) => [iso, ioc].includes(person.nationalityCode)))
      )
        return false;

      if (person.nationalityCode) nationalityCodes.push(person.nationalityCode);

      return true;
    });

    if (validatedPersonData.length) {
      validPersonData = validatedPersonData;
    } else {
      return { error: INVALID_VALUES };
    }
  }

  const shuffledPersons = personData ? validPersonData : shuffleArray(validPersonData, random);

  if (shuffledPersons.length < count) {
    const { maleFirstNames, maleLastNames, femaleFirstNames, femaleLastNames, nationalityCodes } =
      defaultPersonData.reduce(
        (a, person) => {
          const { firstName, lastName, nationalityCode } = person;
          if (person.sex === MALE) {
            if (!a.maleFirstNames.includes(firstName)) a.maleFirstNames.push(firstName);
            if (!a.maleLastNames.includes(lastName)) a.maleLastNames.push(lastName);
          } else {
            if (!a.femaleFirstNames.includes(firstName)) a.femaleFirstNames.push(firstName);
            if (!a.femaleLastNames.includes(lastName)) a.femaleLastNames.push(lastName);
          }
          if (!a.nationalityCodes.includes(nationalityCode)) a.nationalityCodes.push(nationalityCode);
          return a;
        },
        {
          maleFirstNames: [],
          maleLastNames: [],
          femaleFirstNames: [],
          femaleLastNames: [],
          nationalityCodes: [],
        },
      );

    generateRange(0, count - shuffledPersons.length).forEach(() => {
      const personSex = sex || randomMember([MALE, FEMALE], random);
      const nationalityCode = randomMember(nationalityCodes, random);
      const firstName = personSex === MALE ? randomMember(maleFirstNames, random) : randomMember(femaleFirstNames, random);
      const lastName = personSex === MALE ? randomMember(maleLastNames, random) : randomMember(femaleLastNames, random);
      const person = {
        firstName,
        lastName,
        sex: personSex,
        nationalityCode,
      };
      shuffledPersons.push(person);
    });
  }

  const { ageMinDate, ageMaxDate } = getCategoryAgeDetails({
    consideredDate,
    category,
  });

  const rangeStart = ensureInt(ageMinDate?.slice(0, 4) || 0) || ensureInt(ageMaxDate?.slice(0, 4) || 0) - 3;

  const rangeEnd = ensureInt(ageMaxDate?.slice(0, 4) || 0) || ensureInt(ageMinDate?.slice(0, 4) || 0) + 3;

  const yearRange = (ageMinDate || ageMaxDate) && [rangeStart, rangeEnd];

  const persons = shuffledPersons.slice(0, count).map((person, i) => {
    const [start, end] = yearRange ?? [];
    const birthYear = yearRange && randomPop(generateRange(start, end), random);
    const birthDay = randomPop(generateRange(0, 365), random);
    const birthDate = birthYear && dateFromDay(birthYear, birthDay);

    return Object.assign(
      definedAttributes({
        extensions: personExtensions || [{ name: 'regionCode', value: i + 1 }],
        birthDate,
        isMock,
      }),
      person,
    );
  });

  return {
    persons: (persons.length && persons) || shuffledPersons[0],
    nationalityCodes,
  };
}
