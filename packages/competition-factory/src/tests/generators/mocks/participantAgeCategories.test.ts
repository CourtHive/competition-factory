import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { mocksEngine } from '@Assemblies/engines/mock';
import { test, expect } from 'vitest';

// prettier-ignore
const ageCategoryScenarios = [
  { category: { ageCategoryCode: 'U18' }, expectation: { ageMinDate: '2004-01-02', ageMax: 17 }},
  { category: { categoryName: 'U18' }, expectation: { ageMinDate: '2004-01-02', ageMax: 17 }},
  { category: { categoryName: 'No age specification' }, expectation: { }},
  { category: { ageCategoryCode: 'U16' }, expectation: { ageMinDate: '2006-01-02', ageMax: 15 } },
  { category: { ageCategoryCode: '18U' }, expectation: { ageMinDate: '2003-01-02', ageMax: 18 } },
  { category: { ageCategoryCode: '14O' }, expectation: { ageMaxDate: '2007-12-31', ageMin: 14 } },
  { category: { ageCategoryCode: 'O14' }, expectation: { ageMaxDate: '2008-12-31', ageMin: 15 } },
  { category: { ageCategoryCode: '8O-U14' }, expectation: { ageMinDate: '2008-01-02', ageMin: 8, ageMaxDate: '2013-12-31', ageMax: 13 } },
  { category: { ageCategoryCode: 'C50-70' }, expectation: { ageMin: 50, ageMax: 70, combinedAge: true } },
];

test.each(ageCategoryScenarios)('it can parse ageCategoryCodes', (scenario) => {
  const consideredDate = '2022-01-01';
  const result = getCategoryAgeDetails({
    category: scenario.category,
    consideredDate,
  });

  Object.keys(scenario.expectation).forEach((key) => {
    expect(result[key]).toEqual(scenario.expectation[key]);
  });
});

test.each(ageCategoryScenarios)('can generate partiicpants with category details', (scenario) => {
  const consideredDate = '2022-01-01';

  const participantsProfile = {
    category: scenario.category,
    participantsCount: 1,
    consideredDate,
  };

  const {
    participants: [participant],
  } = mocksEngine.generateParticipants(participantsProfile);

  if (Object.keys(scenario.expectation).length && !scenario.expectation.combinedAge)
    expect(participant.person.birthDate).not.toBeUndefined();
});
