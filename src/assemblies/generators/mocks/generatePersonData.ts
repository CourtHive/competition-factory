import { generateRange, randomMember, randomPop } from '@Tools/arrays';
import { isGendered } from '@Validators/isGendered';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { countries } from '@Fixtures/countryData';

// constants
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import namesData from '../../../fixtures/data/names.json';

export function generatePersonData(params?): {
  personData?: any[];
  error?: ErrorType;
} {
  const { count = 100, random, sex } = params ?? {};
  if (!count || (sex && !isGendered(sex))) return { personData: [], error: INVALID_VALUES };

  // generate 30% more than count to account for duplicated firstName/lastName
  const buffer = Math.ceil(count * 1.3);

  const { lastNames, firstFemale, firstMale } = namesData;
  const ISOs = countries.map(({ iso }) => iso).filter(Boolean);

  const lastNameDupeCount = Math.ceil(buffer / lastNames.length);
  const femaleDupeCount = Math.ceil(buffer / firstFemale.length);
  const maleDupeCount = Math.ceil(buffer / firstMale.length);

  const lastNameDupes = generateRange(0, lastNameDupeCount).flatMap(() => {
    const n = makeDeepCopy(lastNames, false, true); // internal use
    return generateRange(0, lastNames.length).map(() => randomPop(n, random));
  });
  const femaleDupes = generateRange(0, femaleDupeCount).flatMap(() => {
    const n = makeDeepCopy(firstFemale, false, true); // internal use
    return generateRange(0, firstFemale.length).map(() => randomPop(n, random));
  });
  const maleDupes = generateRange(0, maleDupeCount).flatMap(() => {
    const n = makeDeepCopy(firstMale, false, true); // internal use
    return generateRange(0, firstMale.length).map(() => randomPop(n, random));
  });

  const candidates = {};
  for (let i = 0; i < buffer; i++) {
    const lastName = lastNameDupes.pop();
    const personSex = sex || randomMember([MALE, FEMALE], random);
    const firstName = personSex === MALE ? maleDupes.pop() : femaleDupes.pop();
    const nationalityCode = randomMember(ISOs, random);
    candidates[`${firstName}${lastName}`] = {
      nationalityCode,
      sex: personSex,
      firstName,
      lastName,
    };
  }

  const personData = Object.values(candidates).slice(0, count);

  return { personData };
}
