import { getPublishState } from '@Query/publishing/getPublishState';
import { tournamentEngine } from '@Engines/syncEngine';
import { mocksEngine } from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import {
  DRAW_DEFINITION_NOT_FOUND,
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_EVENT,
} from '@Constants/errorConditionConstants';

it('should return the publish state of all events', () => {
  const tournamentId = 'tid';
  mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId },
    drawProfiles: [
      { eventId: 'e1', drawId: 'e1-d1', drawSize: 4 },
      { eventId: 'e2', drawId: 'e2-d1', drawSize: 4 },
      { eventId: 'e3', drawId: 'e3-d1', drawSize: 4 },
    ],
    eventProfiles: [
      {
        drawProfiles: [
          { drawId: 'e4-d1', drawSize: 4 },
          { drawId: 'e4-d2', drawSize: 4 },
        ],
        eventId: 'e4',
      },
      {
        eventId: 'e5',
      },
    ],
    setState: true,
  });

  let publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState).toEqual({
    e1: { status: { published: false } },
    e2: { status: { published: false } },
    e3: { status: { published: false } },
    e4: { status: { published: false } },
    e5: { status: { published: false } },
    tournament: { status: { published: false, publishedEventIds: [] } },
  });

  let pubResult = tournamentEngine.publishEvent({ eventId: 'e1' });
  expect(pubResult.success).toEqual(true);

  const seedPublishResult = tournamentEngine.publishEventSeeding({ eventId: 'e1' });
  expect(seedPublishResult.success).toEqual(true);

  publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.e1.status.published).toEqual(true);
  expect(publishState.e2.status.published).toEqual(false);

  let stateResult = tournamentEngine.getPublishState({ eventIds: ['bogus'] });
  expect(stateResult.error).toEqual(EVENT_NOT_FOUND);

  stateResult = tournamentEngine.getPublishState({ eventIds: [100] });
  expect(stateResult.error).toEqual(INVALID_VALUES);

  stateResult = tournamentEngine.getPublishState({ eventId: 'e1', drawIds: ['bogus'] });
  expect(stateResult.error).toEqual(DRAW_DEFINITION_NOT_FOUND);

  stateResult = tournamentEngine.getPublishState({ eventId: 'e1', drawIds: ['e1-d1'] });
  expect(stateResult.publishState['e1-d1'].status.published).toEqual(true);

  stateResult = tournamentEngine.getPublishState({ eventId: 'e1', drawIds: [1] });
  expect(stateResult.error).toEqual(INVALID_VALUES);

  // test event which has no drawDefinitions
  stateResult = tournamentEngine.getPublishState({ eventId: 'e5', drawIds: ['foo'] });
  expect(stateResult.error).toEqual(DRAW_DEFINITION_NOT_FOUND);

  publishState = tournamentEngine.getPublishState({ eventIds: ['e1', 'e2'] }).publishState;
  expect(publishState.e1.status.published).toEqual(true);
  expect(publishState.e2.status.published).toEqual(false);

  publishState = tournamentEngine.getPublishState({ eventId: 'e1' }).publishState;
  expect(publishState.status.published).toEqual(true);
  expect(publishState.status.publishedDrawIds.includes('e1-d1')).toEqual(true);
  expect(publishState.status.drawDetails['e1-d1'].publishingDetail.published).toEqual(true);

  stateResult = tournamentEngine.getPublishState({ eventId: 'e6' });
  expect(stateResult.error).toEqual(EVENT_NOT_FOUND);
  expect(stateResult.publishState).toBeUndefined();

  // test publishing a draw that is already published
  pubResult = tournamentEngine.publishEvent({ eventId: 'e1' });
  expect(pubResult.success).toEqual(true);

  // test publishing a draw that doesn't exist
  pubResult = tournamentEngine.publishEvent({ eventId: 'e6' });
  expect(pubResult.error).toEqual(EVENT_NOT_FOUND);

  pubResult = tournamentEngine.publishEvent({ eventId: 'e3' });
  expect(pubResult.success).toEqual(true);

  pubResult = tournamentEngine.unPublishEvent({ eventId: 'e1' });
  expect(pubResult.success).toEqual(true);

  publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.e1.status.published).toEqual(false);
  expect(publishState.e2.status.published).toEqual(false);
  expect(publishState.e3.status.published).toEqual(true);

  publishState = tournamentEngine.getPublishState({ eventId: 'e4' }).publishState;
  expect(publishState.status.published).toEqual(false);

  // not yet published
  publishState = tournamentEngine.devContext(true).getPublishState({ eventId: 'e4', drawId: 'e4-d1' }).publishState;
  expect(publishState.status.published).toEqual(false);

  // drawId not found
  stateResult = publishState = tournamentEngine.getPublishState({ eventId: 'e4', drawId: 'e4-d3' });
  expect(stateResult.error).toEqual(DRAW_DEFINITION_NOT_FOUND);

  // missing eventId - drawDefinition not reolved when drawId is in an array
  pubResult = tournamentEngine.publishEvent({ drawIdsToAdd: ['e4-d1'] });
  expect(pubResult.error).toEqual(MISSING_EVENT);

  pubResult = tournamentEngine.publishEvent({ eventId: 'e4', drawIdsToAdd: ['e4-d1'] });
  expect(pubResult.success).toEqual(true);

  publishState = tournamentEngine.getPublishState({ drawId: 'e4-d1' }).publishState;
  expect(publishState.status.published).toEqual(true);
  expect(publishState.status.drawDetail).toBeDefined();

  publishState = tournamentEngine.getPublishState({ eventId: 'e4' }).publishState;
  expect(publishState.status.published).toEqual(true);
  expect(publishState.status.publishedDrawIds).toEqual(['e4-d1']);
  expect(publishState.status.drawDetails['e4-d2']).toEqual({ publishingDetail: { published: false } });
  expect(publishState.status.drawDetails['e4-d1']).toEqual({ publishingDetail: { published: true } });

  pubResult = tournamentEngine.publishEvent({ eventId: 'e4', drawIdsToRemove: ['e4-d1'] });
  expect(pubResult.success).toEqual(true);

  publishState = tournamentEngine.getPublishState({ eventId: 'e4' }).publishState;
  expect(publishState.status.published).toEqual(false);

  publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState['e3-d1'].status.published).toEqual(true);
  expect(Object.keys(publishState).map((key) => [key, publishState[key]?.status.published])).toEqual([
    ['e1', false],
    ['e2', false],
    ['e3', true],
    ['e3-d1', true], // drawIds for published draws are included in publishState
    ['e4', false],
    ['e5', false],
    ['tournament', true],
  ]);
});

test('calling getPublishState directly', () => {
  // @ts-expect-error no params
  let result = getPublishState();
  expect(result.success).toEqual(true);

  // @ts-expect-error missing params
  result = getPublishState({ tournamentRecord: {} });
  expect(result.error).toEqual(INVALID_VALUES);

  result = getPublishState({ tournamentRecord: { tournamentId: 'tid' }, eventId: 'eid' });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  // just for test coverage
  getPublishState({ tournamentRecord: { tournamentId: 'tid' } });

  const tournamentRecord: any = {
    events: [{ eventId: 'e6' }],
    tournamentId: 'tid',
  };
  result = getPublishState({ tournamentRecord });
  expect(result.publishState.e6.status.published).toEqual(false);

  result = getPublishState({ tournamentRecord, eventId: 'e6', event: tournamentRecord.events[0] });
  expect(result.publishState.status.published).toEqual(false);

  result = getPublishState({ tournamentRecord, eventId: 'e6', event: tournamentRecord.events[0], drawIds: ['e6-d1'] });
  expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);

  tournamentRecord.events[0].timeItems = [
    {
      itemValue: { PUBLIC: { drawIds: ['e6-d1'] } },
      itemType: 'PUBLISH.STATUS',
    },
  ];

  result = getPublishState({ tournamentRecord });
  expect(result.publishState.e6.status.published).toEqual(true);
});
