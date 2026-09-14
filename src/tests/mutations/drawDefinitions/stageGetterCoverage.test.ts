import { stageStructures, stageSeededEntries, stageAlternateEntries } from '@Query/drawDefinition/stageGetter';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

test('stageStructures returns structures for a given stage and stageSequence', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structures = stageStructures({ stage: MAIN, drawDefinition, stageSequence: 1 });
  expect(structures.length).toBeGreaterThan(0);
  expect(structures[0].stage).toEqual(MAIN);
  expect(structures[0].stageSequence).toEqual(1);

  // falsy stage returns falsy
  const noStage = stageStructures({ stage: undefined, drawDefinition, stageSequence: 1 });
  expect(noStage).toBeFalsy();

  // falsy drawDefinition returns falsy
  const noDraw = stageStructures({ stage: MAIN, drawDefinition: undefined, stageSequence: 1 });
  expect(noDraw).toBeFalsy();
});

test('stageSeededEntries returns seeded entries for a stage', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  // stageSeededEntries checks for c.seed on entries; manually add seed to test the function
  drawDefinition.entries[0].seed = 1;
  drawDefinition.entries[1].seed = 2;
  drawDefinition.entries[2].seed = 3;
  drawDefinition.entries[3].seed = 4;

  const seededEntries = stageSeededEntries({ stage: MAIN, drawDefinition });
  expect(seededEntries.length).toEqual(4);
  seededEntries.forEach((entry) => {
    expect(entry.seed).toBeDefined();
    expect(entry.entryStage).toEqual(MAIN);
  });

  // entries without seed property are not returned
  const nonSeededCount = drawDefinition.entries.filter((e) => !e.seed).length;
  expect(nonSeededCount).toEqual(drawDefinition.entries.length - 4);
});

test('stageAlternateEntries returns count of alternate entries', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  // manually add ALTERNATE entries to the drawDefinition to test the function
  drawDefinition.entries.push(
    { participantId: 'alt-1', entryStage: MAIN, entryStatus: ALTERNATE },
    { participantId: 'alt-2', entryStage: MAIN, entryStatus: ALTERNATE },
    { participantId: 'alt-3', entryStage: MAIN, entryStatus: ALTERNATE },
  );

  const alternateCount = stageAlternateEntries({ stage: MAIN, drawDefinition });
  expect(alternateCount).toEqual(3);
});
