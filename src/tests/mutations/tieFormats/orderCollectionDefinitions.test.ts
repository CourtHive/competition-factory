import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { NOT_FOUND } from '@Constants/errorConditionConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

it('can add collectionDefinitions to tieFormat in a drawDefinition', () => {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ drawId });
  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(drawDefinition.structures[0].tieFormat).toBeUndefined();
  const structureId = drawDefinition.structures[0].structureId;

  const collectionIds = event.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
  const newOrder = [2, 1];
  const orderMap = Object.assign(
    {},
    ...collectionIds.map((collectionId, i) => ({
      [collectionId]: newOrder[i],
    })),
  );

  let result = tournamentEngine.orderCollectionDefinitions({
    orderMap,
  });
  expect(result.error).toEqual(NOT_FOUND);

  result = tournamentEngine.orderCollectionDefinitions({
    orderMap,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.orderCollectionDefinitions({
    orderMap,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.orderCollectionDefinitions({
    structureId,
    orderMap,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const updatedCollectionIds = drawDefinition.structures[0].tieFormat.collectionDefinitions.map(
    ({ collectionId }) => collectionId,
  );

  // tieFormat has been attached to structure and order has been modified
  expect(collectionIds[0]).toEqual(updatedCollectionIds[1]);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const matchUpId = matchUps[0].matchUpId;
  result = tournamentEngine.orderCollectionDefinitions({
    matchUpId,
    orderMap,
    drawId,
  });
  expect(result.success).toEqual(true);
});
