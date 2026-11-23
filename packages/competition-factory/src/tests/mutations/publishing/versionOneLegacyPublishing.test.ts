import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

test('versionOneLegacyPublishing', () => {
  const eventId = 'eid';
  const drawId = 'did';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawId, eventId }],
    setState: true,
  });

  let publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState[eventId].status.published).toEqual(false);

  // v1.x legacy publishing timeItem
  const timeItem = {
    itemValue: { PUBLIC: { drawIds: ['did'] } },
    itemType: 'PUBLISH.STATUS',
  };
  const result = tournamentEngine.addTimeItem({ eventId, timeItem });
  expect(result.success).toEqual(true);

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.timeItems.length).toEqual(1);

  publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState[eventId].status.published).toEqual(true);
  expect(publishState[drawId].status.published).toEqual(true);
});
