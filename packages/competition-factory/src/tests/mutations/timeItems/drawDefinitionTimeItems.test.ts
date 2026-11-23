import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_TIME_ITEM, MISSING_TIME_ITEM, NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFICATION } from '@Constants/timeItemConstants';
import { SINGLES } from '@Constants/eventConstants';

const MODIFICATION_CONTENT = 'MODIFICATION.CONTENT';

// this is necessary to ensure that at least one millisecond has passed between modifications
async function forceDelay(delay = 10) {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), delay));
}

it('can add and read timeItems from events', async () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-06',
  });
  const { participants } = tournamentRecord;

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

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    event: eventResult,
    automated: true,
    drawSize: 32,
    participants,
    eventId,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  const { drawId } = drawDefinition;
  const createdAt = drawDefinition.updatedAt;

  await forceDelay();

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  let timeItem: any = undefined;
  result = tournamentEngine.addDrawDefinitionTimeItem({ drawId, timeItem });
  expect(result.error).toEqual(MISSING_TIME_ITEM);

  timeItem = {
    itemType: MODIFICATION,
  };
  result = tournamentEngine.addDrawDefinitionTimeItem({ drawId, timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  timeItem = {
    itemType: MODIFICATION_CONTENT,
  };
  result = tournamentEngine.addDrawDefinitionTimeItem({ drawId, timeItem });
  expect(result.error).toEqual(INVALID_TIME_ITEM);

  const itemValue = '2021-01-01T00:00';
  timeItem = {
    itemType: MODIFICATION_CONTENT,
    itemValue,
  };
  result = tournamentEngine.addDrawDefinitionTimeItem({ drawId, timeItem });
  expect(result.success).toEqual(true);

  let { timeItem: retrievedTimeItem, info } = tournamentEngine.getTimeItem({
    itemType: MODIFICATION_CONTENT,
    drawId,
  });
  expect(retrievedTimeItem.itemValue).toEqual(itemValue);
  expect(info).toEqual(undefined);

  ({ timeItem: retrievedTimeItem, info } = tournamentEngine.getTimeItem({
    itemType: 'MODIFICATION.OTHER',
    drawId,
  }));
  expect(retrievedTimeItem).toEqual(undefined);
  expect(info).toEqual(NOT_FOUND);

  const {
    event: {
      drawDefinitions: [updatedDrawDefinition],
    },
  } = tournamentEngine.getEvent({ eventId });
  expect(updatedDrawDefinition.timeItems.length).toEqual(1);
  expect(new Date(updatedDrawDefinition.updatedAt).getTime()).toBeGreaterThan(new Date(createdAt).getTime());
});
