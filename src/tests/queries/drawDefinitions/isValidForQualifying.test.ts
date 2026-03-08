import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { QUALIFYING, MAIN } from '@Constants/drawDefinitionConstants';

it('returns error when drawDefinition is missing', () => {
  const result = tournamentEngine.isValidForQualifying({
    structureId: 'someId',
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('returns error when structureId is not a string', () => {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  const result = tournamentEngine.isValidForQualifying({
    structureId: undefined,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('returns valid true for a main structure with no qualifying links', () => {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

  const result = tournamentEngine.isValidForQualifying({
    structureId: mainStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.valid).toEqual(true);
});

it('returns valid true for a qualifying structure that feeds main without feed profile', () => {
  const drawId = 'testDrawId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize: 16,
        qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifyingStructure = drawDefinition.structures.find((s) => s.stage === QUALIFYING);
  expect(qualifyingStructure).toBeDefined();

  const result = tournamentEngine.isValidForQualifying({
    structureId: qualifyingStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  // Qualifying structures that feed into main without feedProfile should be valid
  expect(result.valid).toEqual(true);
});

it('returns valid for structure with no target links', () => {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];

  // A structure that is not a target of any link should be valid
  const result = tournamentEngine.isValidForQualifying({
    structureId: structure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.valid).toEqual(true);
});
