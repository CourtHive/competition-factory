import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { PUBLISH, STATUS } from '@Constants/timeItemConstants';

test('mocksEngine can publish generated events', () => {
  const drawProfiles = [{ drawSize: 32, publish: true }];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ drawId });

  const publishStatus = event.timeItems.find((timeItem) => timeItem.itemType === `${PUBLISH}.${STATUS}`);

  expect(publishStatus).not.toBeUndefined();
});
