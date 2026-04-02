import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { MODIFICATION } from '@Constants/timeItemConstants';
import { INVALID_TIME_ITEM, MISSING_TIME_ITEM, NOT_FOUND } from '@Constants/errorConditionConstants';

const MODIFICATION_CONTENT = 'MODIFICATION.CONTENT';
const MODIFICATION_OTHER = 'MODIFICATION.OTHER';
const timeStamp1 = '2021-01-01T00:00';
const timeStamp2 = '2021-01-02T00:00';

it('can add and read timeItems from events', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-06',
  });

  tournamentEngine.setState(tournamentRecord);

  let timeItem: any = undefined;
  let result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.error).toEqual(MISSING_TIME_ITEM);

  timeItem = {
    itemType: MODIFICATION,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  timeItem = {
    itemType: MODIFICATION_CONTENT,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  let itemValue = timeStamp1;
  timeItem = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.success).toEqual(true);

  timeItem = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({
    timeItem,
  });
  expect(result.success).toEqual(true);

  itemValue = timeStamp2;
  timeItem = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.success).toEqual(true);

  let {
    timeItem: retrievedTimeItem,
    previousItems,
    info,
  } = tournamentEngine.getTimeItem({
    itemType: MODIFICATION_CONTENT,
    returnPreviousValues: true,
  });
  expect(retrievedTimeItem.itemValue).toEqual(itemValue);
  expect(previousItems.length).toEqual(2);
  expect(info).toEqual(undefined);

  ({ timeItem: retrievedTimeItem, info } = tournamentEngine.getTimeItem({
    itemType: MODIFICATION_OTHER,
  }));
  expect(retrievedTimeItem).toEqual(undefined);
  expect(info).toEqual(NOT_FOUND);
});

it('can prevent duplicates when equialent to existing itemValue', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-06',
  });

  tournamentEngine.setState(tournamentRecord);

  let itemValue = timeStamp1;
  let timeItem: any = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  let result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.success).toEqual(true);

  timeItem = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({
    duplicateValues: false,
    timeItem,
  });
  expect(result.success).toEqual(true);

  itemValue = timeStamp2;
  timeItem = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.success).toEqual(true);

  let {
    timeItem: retrievedTimeItem,
    previousItems,
    info,
  } = tournamentEngine.getTimeItem({
    itemType: MODIFICATION_CONTENT,
    returnPreviousValues: true,
  });
  expect(retrievedTimeItem.itemValue).toEqual(itemValue);
  expect(previousItems.length).toEqual(1);
  expect(info).toEqual(undefined);

  // now test where the duplicate values are not sequential
  // should add the duplicate value because it is not the "current" value at the time of addition
  itemValue = timeStamp1;
  timeItem = {
    itemType: MODIFICATION_OTHER,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.success).toEqual(true);

  itemValue = '2021-01-02T00:00';
  timeItem = {
    itemType: MODIFICATION_OTHER,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({
    duplicateValues: false,
    timeItem,
  });
  expect(result.success).toEqual(true);

  itemValue = timeStamp1;
  timeItem = {
    itemType: MODIFICATION_OTHER,
    itemValue,
  };
  result = tournamentEngine.addTimeItem({ timeItem });
  expect(result.success).toEqual(true);

  ({
    timeItem: retrievedTimeItem,
    previousItems,
    info,
  } = tournamentEngine.getTimeItem({
    itemType: MODIFICATION_OTHER,
    returnPreviousValues: true,
  }));
  expect(retrievedTimeItem.itemValue).toEqual(itemValue);
  expect(previousItems.length).toEqual(2);
  expect(info).toEqual(undefined);

  // expect the retrieved itemValue to equal the initial itemValue
  expect(retrievedTimeItem.itemValue).toEqual(previousItems[0].itemValue);
  // expect the retrieved itemValue NOT to equal the latest itemValue
  expect(retrievedTimeItem.itemValue).not.toEqual(previousItems[1].itemValue);
});
