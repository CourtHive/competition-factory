import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPASS, CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

test('can recreate an exitProfile for a COMPASS draw', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: COMPASS }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const exitProfiles = getExitProfiles({ drawDefinition }).exitProfiles ?? {};
  expect(Object.values(exitProfiles)).toEqual([
    ['0'],
    ['0-1'],
    ['0-1-1'],
    ['0-1-1-1'],
    ['0-1-2'],
    ['0-2'],
    ['0-2-1'],
    ['0-3'],
  ]);
});

test('can recreate an exitProfile for a CURTIS_CONSOLATION draw', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 64, drawType: CURTIS_CONSOLATION }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const exitProfiles = getExitProfiles({ drawDefinition }).exitProfiles ?? {};
  expect(Object.values(exitProfiles)).toEqual([['0'], ['0-1', '0-2'], ['0-3', '0-4'], ['0-5']]);
});
