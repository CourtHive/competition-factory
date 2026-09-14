import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getStructureGroups } from '@Query/structure/getStructureGroups';
import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

const drawId = 'did';

it('can extract elimination structures', () => {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId, drawSize: 32, seedsCount: 8 }], setState: true });
  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { structureGroups, allStructuresLinked } = getStructureGroups({
    drawDefinition,
  });
  expect(allStructuresLinked).toEqual(true);
  expect(structureGroups.length).toEqual(1);
});

it('can extract round robin structures', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: ROUND_ROBIN, seedsCount: 8 }],
    setState: true,
  });
  const {
    drawDefinition,
    event: { eventId },
  } = tournamentEngine.getEvent({ drawId });
  const { structureGroups, allStructuresLinked } = getStructureGroups({
    drawDefinition,
  });
  expect(allStructuresLinked).toEqual(true);
  expect(structureGroups.length).toEqual(1);

  let result = tournamentEngine.getDrawData({ drawId });
  expect(result.structures?.length).toEqual(1);
  expect(result.drawInfo.drawActive).toEqual(false);
  expect(result.drawInfo.drawCompleted).toEqual(false);
  expect(result.drawInfo.drawGenerated).toEqual(true);
  expect(result.structures?.length).toEqual(1);

  result = tournamentEngine.getDrawData({ drawId, usePublishState: true });
  expect(result.structures).toBeUndefined();

  let event = tournamentEngine.getEvent({ drawId }).event;
  let publishStatus = getEventPublishStatus({ event });
  expect(publishStatus).toBeUndefined();

  result = tournamentEngine.publishEvent({ eventId });
  expect(result.success).toEqual(true);
  event = tournamentEngine.getEvent({ drawId }).event;
  publishStatus = getEventPublishStatus({ event });
  expect(publishStatus.drawDetails[drawId].publishingDetail.published).toEqual(true);

  result = tournamentEngine.getDrawData({ drawId, usePublishState: true });
  expect(result.structures).toBeDefined();
});
