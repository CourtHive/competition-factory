import { findExtension } from '@Acquire/findExtension';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { ENTRY_PROFILE } from '@Constants/extensionConstants';

it('returns error when drawDefinition is missing', () => {
  const result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 16,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('can add a voluntary consolation stage to a draw definition', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 16,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Verify the entry profile extension now includes a VOLUNTARY_CONSOLATION stage
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { extension } = findExtension({
    element: drawDefinition,
    name: ENTRY_PROFILE,
  });
  expect(extension).toBeDefined();
  expect(extension?.value[VOLUNTARY_CONSOLATION]).toBeDefined();
  expect(extension?.value[VOLUNTARY_CONSOLATION].drawSize).toEqual(16);
});

it('can add voluntary consolation with different draw sizes', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 8,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { extension } = findExtension({
    element: drawDefinition,
    name: ENTRY_PROFILE,
  });
  expect(extension?.value[VOLUNTARY_CONSOLATION].drawSize).toEqual(8);
});

it('can overwrite the voluntary consolation stage draw size', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 16,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addVoluntaryConsolationStage({
    drawSize: 8,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { extension } = findExtension({
    element: drawDefinition,
    name: ENTRY_PROFILE,
  });
  expect(extension?.value[VOLUNTARY_CONSOLATION].drawSize).toEqual(8);
});
