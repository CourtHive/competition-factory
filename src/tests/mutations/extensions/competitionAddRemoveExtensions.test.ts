import competitionEngineSync from '@Engines/syncEngine';
import { findExtension } from '@Acquire/findExtension';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// types
import { Tournament } from '@Types/tournamentTypes';

test.each([competitionEngineSync])(
  'can add and remove extensions from tournamentRecords loaded into competitionEngine',
  async (competitionEngine) => {
    const { tournamentRecord: firstRecord } = mocksEngine.generateTournamentRecord();
    const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord();
    await competitionEngine.setState([firstRecord, secondRecord]);

    const extensionName = 'extensionName';
    const extensionValue = 'extensionValue';
    const extension = { name: extensionName, value: extensionValue };

    let result = await competitionEngine.addExtension({
      discover: true,
      extension,
    });
    expect(result.success).toEqual(true);

    const { extension: foundExtension } = await competitionEngine.devContext(true).findExtension({
      name: extensionName,
      discover: true,
    });
    expect(foundExtension.name).toEqual(extensionName);

    result = await competitionEngine.removeExtension({
      name: extensionName,
      discover: true,
    });
    expect(result.success).toEqual(true);

    const { tournamentRecords } = await competitionEngine.getState();
    Object.keys(tournamentRecords).forEach((tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      expect(tournamentRecord.extensions.length).toEqual(0);
    });
  },
);

test.each([competitionEngineSync])('competitionEngine can add event extensions', async (competitionEngine) => {
  let result = await competitionEngine.importMethods({});
  expect(result.success).toEqual(true);
  const drawProfiles = [{ drawSize: 16 }];
  const {
    tournamentRecord: firstRecord,
    eventIds: [firstEventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles });
  const {
    tournamentRecord: secondRecord,
    eventIds: [secondEventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles });
  await competitionEngine.setState([firstRecord, secondRecord]);

  const extensionName = 'extensionName';
  const extensionValue = 'extensionValue';
  const extension = { name: extensionName, value: extensionValue };

  result = await competitionEngine.addEventExtension({
    eventId: firstEventId,
    extension,
  });
  expect(result.success).toEqual(true);

  result = await competitionEngine.addEventExtension({
    eventId: secondEventId,
    extension,
  });
  expect(result.success).toEqual(true);

  const state = await competitionEngine.getState();
  const { tournamentRecords } = state as { tournamentRecords: Tournament[] };
  Object.values(tournamentRecords).forEach((tournamentRecord) => {
    const event = tournamentRecord?.events?.[0];
    const { extension } = findExtension({
      name: extensionName,
      element: event,
    });
    expect(extension?.value).toEqual(extensionValue);
  });
});
