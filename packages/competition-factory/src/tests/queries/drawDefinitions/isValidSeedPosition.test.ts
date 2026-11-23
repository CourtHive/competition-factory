import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

/**
 * `isValidSeedPosition` reads the structure's seed blocks. Two latent defects:
 *
 * - when neither `seedBlockInfo` nor the structure resolves there are no blocks, and the method
 *   threw reading them (the engine surfaced the TypeError as the result);
 * - under a `strict` policy with no `seedNumber` it looked for the block holding `undefined`, so
 *   every position was invalid. `positionActions` asks exactly that question (no seedNumber) when it
 *   decides whether to offer SEED_VALUE and REMOVE_SEED, so a strict policy hid both actions.
 *
 * `strict` narrows a seed to its own block; with no seed to narrow by, the answer is the lenient one
 * (is this a seed position at all).
 */

const LENIENT = { seeding: { policyName: 'lenient' } } as any;
const STRICT = { seeding: { policyName: 'strict', validSeedPositions: { strict: true } } } as any;

function draw32() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 32, seedsCount: 8 }],
    setState: true,
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  return { drawDefinition, structureId: drawDefinition.structures[0].structureId };
}

describe('isValidSeedPosition', () => {
  it('returns false rather than throwing when the structure does not resolve', () => {
    const { drawDefinition } = draw32();
    const result: any = tournamentEngine.isValidSeedPosition({
      structureId: 'unknown-structure-id',
      appliedPolicies: LENIENT,
      drawDefinition,
      drawPosition: 1,
    });
    expect(result).toEqual(false);
  });

  it('a strict policy with no seedNumber accepts seed positions and rejects the rest', () => {
    const { drawDefinition, structureId } = draw32();
    const isValid = (drawPosition: number, seedNumber?: number) =>
      tournamentEngine.isValidSeedPosition({
        appliedPolicies: STRICT,
        drawDefinition,
        drawPosition,
        structureId,
        seedNumber,
      });

    // drawPosition 1 is seed 1's block; drawPosition 2 is no seed's position
    expect(isValid(1)).toEqual(true);
    expect(isValid(2)).toEqual(false);

    // with a seedNumber, strict still narrows to that seed's block
    expect(isValid(1, 1)).toEqual(true);
    expect(isValid(1, 2)).toEqual(false);
  });
});
