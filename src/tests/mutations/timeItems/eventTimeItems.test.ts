import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_TIME_ITEM, MISSING_TIME_ITEM, NOT_FOUND } from '@Constants/errorConditionConstants';
import { RETRIEVAL } from '@Constants/timeItemConstants';
import { SINGLES } from '@Constants/eventConstants';

it('can add and read timeItems from events', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-06',
  });

  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    eventName,
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  let timeItem: any = undefined;
  result = tournamentEngine.addEventTimeItem({ eventId, timeItem });
  expect(result.error).toEqual(MISSING_TIME_ITEM);

  timeItem = {
    itemType: RETRIEVAL,
  };
  result = tournamentEngine.addEventTimeItem({ eventId, timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  timeItem = {
    itemType: 'RETRIEVAL.RATING',
  };
  result = tournamentEngine.addEventTimeItem({ eventId, timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  const itemValue = '2021-01-01T00:00';
  timeItem = {
    itemType: 'RETRIEVAL.RATING.SINGLES.U18',
    itemValue,
  };
  result = tournamentEngine.addEventTimeItem({ eventId, timeItem });
  expect(result.success).toEqual(true);

  let { timeItem: retrievedTimeItem, info } = tournamentEngine.getEventTimeItem({
    itemType: 'RETRIEVAL.RATING.SINGLES.U18',
    eventId,
  });
  expect(retrievedTimeItem.itemValue).toEqual(itemValue);
  expect(info).toEqual(undefined);

  ({ timeItem: retrievedTimeItem, info } = tournamentEngine.getEventTimeItem({
    itemType: 'RETRIEVAL.RATING.SINGLES.U16',
    eventId,
  }));
  expect(retrievedTimeItem).toEqual(undefined);
  expect(info).toEqual(NOT_FOUND);
});
