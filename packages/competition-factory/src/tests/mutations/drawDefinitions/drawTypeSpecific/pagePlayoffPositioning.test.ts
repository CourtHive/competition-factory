import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { PAGE_PLAYOFF } from '@Constants/drawDefinitionConstants';

const placedIn = (structure) => structure.positionAssignments.map(({ participantId }) => participantId).filter(Boolean);

it('a PAGE_PLAYOFF places two entrants in Qualifier 1 and the other two in the Eliminator', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const byAbbreviation = (abbreviation) =>
    drawDefinition.structures.find(({ structureAbbreviation }) => structureAbbreviation === abbreviation);

  const qualifierOne = placedIn(byAbbreviation('Q1'));
  const eliminator = placedIn(byAbbreviation('EL'));
  expect(qualifierOne).toHaveLength(2);
  expect(eliminator).toHaveLength(2);

  const enteredIds = drawDefinition.entries.map(({ participantId }) => participantId);
  expect([...qualifierOne, ...eliminator].sort((a, b) => a.localeCompare(b))).toEqual(
    enteredIds.sort((a, b) => a.localeCompare(b)),
  );
});

it('a PAGE_PLAYOFF places the top two seeds in Qualifier 1', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF, seedsCount: 2 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifierOne = drawDefinition.structures.find(({ structureAbbreviation }) => structureAbbreviation === 'Q1');
  const seededIds = qualifierOne.seedAssignments
    .filter(({ seedNumber }) => seedNumber <= 2)
    .map(({ participantId }) => participantId);

  expect(seededIds).toHaveLength(2);
  expect(placedIn(qualifierOne).sort((a, b) => a.localeCompare(b))).toEqual(
    seededIds.sort((a, b) => a.localeCompare(b)),
  );
});

it('a PAGE_PLAYOFF can be played through to a champion', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: PAGE_PLAYOFF }],
    completeAllMatchUps: true,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  expect(matchUps).toHaveLength(4);
  expect(matchUps.every(({ winningSide }) => winningSide)).toEqual(true);
});
