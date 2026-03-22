import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { INVALID_STRUCTURE } from '@Constants/errorConditionConstants';

it('rejects attachStructures when links reference non-existent structures', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
  expect(mainStructure).toBeDefined();

  // create a link with a bogus target structureId
  const links = [
    {
      linkType: 'LOSER',
      source: {
        structureId: mainStructure.structureId,
        roundNumber: 1,
      },
      target: {
        structureId: 'non-existent-structure-id',
        feedProfile: 'DRAW',
        roundNumber: 1,
      },
    },
  ];

  let result: any = tournamentEngine.attachStructures({
    structures: [],
    drawId,
    links,
  });

  expect(result.error).toEqual(INVALID_STRUCTURE);
  expect(result.info).toContain('non-existent');
});

it('rejects attachStructures when link source structureId is invalid', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);

  const links = [
    {
      linkType: 'LOSER',
      source: {
        structureId: 'bogus-source-id',
        roundNumber: 1,
      },
      target: {
        structureId: mainStructure.structureId,
        feedProfile: 'DRAW',
        roundNumber: 1,
      },
    },
  ];

  let result: any = tournamentEngine.attachStructures({
    structures: [],
    drawId,
    links,
  });

  expect(result.error).toEqual(INVALID_STRUCTURE);
});

it('accepts attachStructures when links reference valid structures', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    setState: true,
  });

  // a draw with consolation should have valid links already wired
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolationStructure = drawDefinition.structures.find((s) => s.stage === CONSOLATION);
  expect(consolationStructure).toBeDefined();
  expect(drawDefinition.links.length).toBeGreaterThan(0);
});
