import { generatePersonData } from '@Assemblies/generators/mocks/generatePersonData';
import { instanceCount, unique } from '@Tools/arrays';
import namesData from '@Fixtures/data/names.json';
import { numericSort } from '@Tools/sorting';
import { it, expect } from 'vitest';

// constants
import { FEMALE, MALE } from '@Constants/genderConstants';

it('can generation personData', () => {
  let { personData } = generatePersonData();
  expect(personData?.length).toEqual(100);

  for (const person of personData ?? []) {
    expect(person.nationalityCode).not.toBeUndefined();
    expect(person.firstName).not.toBeUndefined();
    expect(person.lastName).not.toBeUndefined();
    expect(person.sex).not.toBeUndefined();
  }

  let count = 200;
  personData = generatePersonData({ count, sex: MALE }).personData;
  expect(personData?.length).toEqual(count);
  expect(instanceCount(personData?.map(({ sex }) => sex))).toEqual({
    MALE: count,
  });

  count = 50;
  personData = generatePersonData({ count, sex: FEMALE }).personData;
  expect(personData?.length).toEqual(count);
  expect(instanceCount(personData?.map(({ sex }) => sex))).toEqual({
    FEMALE: count,
  });
});

it('minimizes duplication of names', () => {
  let count = 200;
  let { personData } = generatePersonData({ count, sex: MALE });
  expect(personData?.length).toEqual(count);

  let first: string[] = [];
  let last: string[] = [];
  personData?.forEach((person) => {
    const { firstName, lastName } = person;
    first.push(firstName);
    last.push(lastName);
  });

  let firstInstances = instanceCount(first);
  let lastInstances = instanceCount(last);

  const { lastNames, firstFemale, firstMale } = namesData;

  let firstCount = Object.keys(firstInstances).length;
  // fails if there are any duplicated firstMale names
  expect(firstCount).toEqual(firstMale.length);
  let firstInstanceRange = unique(Object.values(firstInstances)).sort(numericSort);
  expect(firstInstanceRange[1] - firstInstanceRange[0]).toEqual(1);

  let lastCount = Object.keys(lastInstances).length;
  // fails if there are any duplicated lastNames
  expect(lastCount).toEqual(lastNames.length);
  let lastInstanceRange = unique(Object.values(lastInstances)).sort(numericSort);
  if (lastInstanceRange.length > 1) {
    expect(lastInstanceRange[1] - lastInstanceRange[0]).toEqual(1);
  }

  count = 400;
  personData = generatePersonData({ count, sex: FEMALE }).personData;
  expect(personData?.length).toEqual(count);
  first = [];
  last = [];
  personData?.forEach((person) => {
    const { firstName, lastName } = person;
    first.push(firstName);
    last.push(lastName);
  });

  firstInstances = instanceCount(first);
  lastInstances = instanceCount(last);

  firstCount = Object.keys(firstInstances).length;
  // fails if there are any duplicated firstFemale names
  expect(firstCount).toEqual(firstFemale.length);
  firstInstanceRange = unique(Object.values(firstInstances)).sort(numericSort);
  expect(firstInstanceRange[1] - firstInstanceRange[0]).toBeLessThanOrEqual(2);

  lastCount = Object.keys(lastInstances).length;
  expect(lastCount).toEqual(lastNames.length);
  lastInstanceRange = unique(Object.values(lastInstances)).sort(numericSort);
  expect(lastInstanceRange[1] - lastInstanceRange[0]).toBeLessThanOrEqual(2);
});
