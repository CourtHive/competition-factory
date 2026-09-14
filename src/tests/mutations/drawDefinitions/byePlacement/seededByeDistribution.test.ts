import { getSeededDrawPositions } from '@Query/drawDefinition/getSeededDrawPositions';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

const scenarios = [
  { drawSize: 16, participantsCount: 13, seedsCount: 4, threshold: 3 },
  { drawSize: 32, participantsCount: 29, seedsCount: 8, threshold: 3 },
  { drawSize: 32, participantsCount: 27, seedsCount: 8, threshold: 5 },
  { drawSize: 32, participantsCount: 26, seedsCount: 8, threshold: 5 },
];

it.each(scenarios)('properly distributes byes to seeds', (scenario) => {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        category: { categoryName: 'U18' },
        ...scenario,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const seededDrawPositions = getSeededDrawPositions({
    drawDefinition,
  }).seededDrawPositions;

  const getSequentialByes = (seededDrawPositions) =>
    seededDrawPositions.slice(0, scenario.threshold).every((p) => p.hasBye);

  const thresholdSequentialByes = getSequentialByes(seededDrawPositions);

  result = [thresholdSequentialByes].concat(
    generateRange(0, 10).map(() => {
      const drawDefinition = tournamentEngine.generateDrawDefinition({
        seedsCount: scenario.seedsCount,
        seedingScaleName: 'U18',
        eventId,
      }).drawDefinition;
      const seededDrawPositions = getSeededDrawPositions({
        drawDefinition,
      }).seededDrawPositions;
      const thresholdSequentialByes = getSequentialByes(seededDrawPositions);
      if (!thresholdSequentialByes) console.log({ seededDrawPositions });
      return thresholdSequentialByes;
    }),
  );

  expect(result.every(Boolean)).toEqual(true);
});
