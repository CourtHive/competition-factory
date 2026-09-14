import { generateCourts } from '@Assemblies/generators/venues/generateCourts';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';

it('can generate courts', () => {
  // @ts-expect-error no params
  let result = generateCourts();
  expect(result.error).toEqual(MISSING_VALUE);

  result = generateCourts({ count: 3 });
  expect(result.success).toEqual(true);

  result = generateCourts({ count: 3, dates: ['invalid'] });
  expect(result.error).toEqual(INVALID_VALUES);

  result = generateCourts({ count: 3, dates: ['2021-01-01'] });
  expect(result.success).toEqual(true);

  result = generateCourts({ count: 3, dates: ['2021-01-02'], idPrefix: 'court' });
  expect(result.courts?.map(xa('courtId'))).toEqual(['court-1', 'court-2', 'court-3']);

  // @ts-expect-error no params
  result = generateCourts({ count: 3, dates: ['2021-01-03'], idPrefix: 5 });
  expect(result.error).toEqual(INVALID_VALUES);

  result = generateCourts({ count: 4, namePrefix: 'Corte' });
  expect(result.courts?.map(xa('courtName'))).toEqual(['Corte 1', 'Corte 2', 'Corte 3', 'Corte 4']);
});
