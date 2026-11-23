import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_TIME_ITEM, MISSING_TIME_ITEM, NOT_FOUND } from '@Constants/errorConditionConstants';
import { RETRIEVAL } from '@Constants/timeItemConstants';

it('can add and read timeItems from participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();

  const { participantId } = participants[0];

  let timeItem: any = undefined;
  let result = tournamentEngine.addParticipantTimeItem({
    participantId,
    timeItem,
  });
  expect(result.error).toEqual(MISSING_TIME_ITEM);

  timeItem = {
    itemType: RETRIEVAL,
  };
  result = tournamentEngine.addParticipantTimeItem({ participantId, timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  timeItem = {
    itemType: 'BOGUS.TIME.ITEM',
  };
  result = tournamentEngine.addParticipantTimeItem({ participantId, timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  const itemValue = '2021-01-01T00:00';
  timeItem = {
    itemType: 'TESTING.1',
    itemValue,
  };
  result = tournamentEngine.addParticipantTimeItem({ participantId, timeItem });
  expect(result.success).toEqual(true);

  let { timeItem: retrievedTimeItem, info } = tournamentEngine.getTimeItem({
    itemType: 'TESTING.1',
    participantId,
  });
  expect(retrievedTimeItem.itemValue).toEqual(itemValue);
  expect(info).toEqual(undefined);

  ({ timeItem: retrievedTimeItem, info } = tournamentEngine.getTimeItem({
    participantId,
    itemType: 'TESTING.2',
  }));
  expect(retrievedTimeItem).toEqual(undefined);
  expect(info).toEqual(NOT_FOUND);
});
