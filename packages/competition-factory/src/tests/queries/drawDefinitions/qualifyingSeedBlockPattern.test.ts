import { getSeedBlockPattern } from '@Query/drawDefinition/seedGetter';
import { chunkArray, generateRange } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants and types
import { CLUSTER, SEPARATE } from '@Constants/drawDefinitionConstants';
import { SeedingProfile } from '@Types/factoryTypes';

type Scenrio = {
  seedingProfile: SeedingProfile;
  qualifiersCount: number;
  expectation?: any;
  drawSize: number;
};

const scenarios: Scenrio[] = [
  {
    seedingProfile: { positioning: CLUSTER, nonRandom: true },
    qualifiersCount: 2,
    drawSize: 16,
    expectation: [
      { seedNumbers: [1], drawPositions: [1] },
      { seedNumbers: [2], drawPositions: [9] },
      { seedNumbers: [3], drawPositions: [16] },
      { seedNumbers: [4], drawPositions: [8] },
      { seedNumbers: [5], drawPositions: [4] },
      { seedNumbers: [6], drawPositions: [12] },
      { seedNumbers: [7], drawPositions: [13] },
      { seedNumbers: [8], drawPositions: [5] },
      { seedNumbers: [9], drawPositions: [2] },
      { seedNumbers: [10], drawPositions: [10] },
      { seedNumbers: [11], drawPositions: [11] },
      { seedNumbers: [12], drawPositions: [3] },
      { seedNumbers: [13], drawPositions: [6] },
      { seedNumbers: [14], drawPositions: [14] },
      { seedNumbers: [15], drawPositions: [15] },
      { seedNumbers: [16], drawPositions: [7] },
    ],
  },
  {
    seedingProfile: { positioning: SEPARATE, nonRandom: true },
    qualifiersCount: 2,
    drawSize: 16,
    expectation: [
      { seedNumbers: [1], drawPositions: [1] },
      { seedNumbers: [2], drawPositions: [9] },
      { seedNumbers: [3], drawPositions: [13] },
      { seedNumbers: [4], drawPositions: [5] },
      { seedNumbers: [5], drawPositions: [3] },
      { seedNumbers: [6], drawPositions: [11] },
      { seedNumbers: [7], drawPositions: [15] },
      { seedNumbers: [8], drawPositions: [7] },
      { seedNumbers: [9], drawPositions: [2] },
      { seedNumbers: [10], drawPositions: [10] },
      { seedNumbers: [11], drawPositions: [12] },
      { seedNumbers: [12], drawPositions: [4] },
      { seedNumbers: [13], drawPositions: [6] },
      { seedNumbers: [14], drawPositions: [14] },
      { seedNumbers: [15], drawPositions: [16] },
      { seedNumbers: [16], drawPositions: [8] },
    ],
  },
  {
    seedingProfile: { positioning: CLUSTER, nonRandom: true },
    qualifiersCount: 4,
    drawSize: 16,
    expectation: [
      { seedNumbers: [1], drawPositions: [1] },
      { seedNumbers: [2], drawPositions: [5] },
      { seedNumbers: [3], drawPositions: [9] },
      { seedNumbers: [4], drawPositions: [13] },
      { seedNumbers: [5], drawPositions: [16] },
      { seedNumbers: [6], drawPositions: [12] },
      { seedNumbers: [7], drawPositions: [8] },
      { seedNumbers: [8], drawPositions: [4] },
      { seedNumbers: [9], drawPositions: [2] },
      { seedNumbers: [10], drawPositions: [6] },
      { seedNumbers: [11], drawPositions: [10] },
      { seedNumbers: [12], drawPositions: [14] },
      { seedNumbers: [13], drawPositions: [15] },
      { seedNumbers: [14], drawPositions: [11] },
      { seedNumbers: [15], drawPositions: [7] },
      { seedNumbers: [16], drawPositions: [3] },
    ],
  },
  {
    seedingProfile: { positioning: SEPARATE, nonRandom: true },
    qualifiersCount: 4,
    drawSize: 16,
    expectation: [
      { seedNumbers: [1], drawPositions: [1] },
      { seedNumbers: [2], drawPositions: [5] },
      { seedNumbers: [3], drawPositions: [9] },
      { seedNumbers: [4], drawPositions: [13] },
      { seedNumbers: [5], drawPositions: [15] },
      { seedNumbers: [6], drawPositions: [11] },
      { seedNumbers: [7], drawPositions: [7] },
      { seedNumbers: [8], drawPositions: [3] },
      { seedNumbers: [9], drawPositions: [2] },
      { seedNumbers: [10], drawPositions: [6] },
      { seedNumbers: [11], drawPositions: [10] },
      { seedNumbers: [12], drawPositions: [14] },
      { seedNumbers: [13], drawPositions: [16] },
      { seedNumbers: [14], drawPositions: [12] },
      { seedNumbers: [15], drawPositions: [8] },
      { seedNumbers: [16], drawPositions: [4] },
    ],
  },
];

test.each(scenarios)('generation of seed block patterns', (scenario) => {
  const { drawSize, qualifiersCount, seedingProfile } = scenario;
  const drawPositions = generateRange(1, drawSize + 1);
  const seedGroups = chunkArray(drawPositions, qualifiersCount);
  const drawPositionBlocks = chunkArray(drawPositions, Math.floor(drawSize / qualifiersCount));

  const { positioning, nonRandom } = seedingProfile;
  const { validSeedBlocks } = getSeedBlockPattern({
    drawPositionBlocks,
    positioning,
    seedGroups,
    nonRandom,
  });

  if (scenario.expectation) {
    expect(scenario.expectation).toEqual(validSeedBlocks);
  } else {
    console.log({ positioning }, validSeedBlocks);
  }

  expect(validSeedBlocks);
});
