import { getRandomQualifierList } from '@Query/drawDefinition/getRandomQualifierList';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRandomSource } from '@Tools/prng';

// constants and types
import type { DrawDefinition } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';

function drawDefinition(count = 4): DrawDefinition {
  return {
    drawId: 'qualifier-shuffle',
    structures: [
      {
        structureId: 'main',
        stage: MAIN,
        stageSequence: 1,
        positionAssignments: Array.from({ length: count }, (_, index) => ({
          drawPosition: index + 1,
          qualifier: true,
        })),
      },
    ],
  } as DrawDefinition;
}

afterEach(() => setRandomSource());

describe('qualifier identity shuffle', () => {
  it('draws one random key per placeholder and returns the corresponding permutation', () => {
    const draw = drawDefinition();
    const before = structuredClone(draw);
    const keys = [0.8, 0.1, 0.6, 0.2];
    const random = vi.fn(() => keys.shift()!);
    expect(getRandomQualifierList({ drawDefinition: draw, random })).toEqual([1, 3, 2, 0]);
    expect(random).toHaveBeenCalledTimes(4);
    expect(draw).toEqual(before);
  });

  it('uses the configured random source when the call supplies none', () => {
    const keys = [0.8, 0.1, 0.6, 0.2];
    setRandomSource(() => keys.shift()!);
    expect(getRandomQualifierList({ drawDefinition: drawDefinition() })).toEqual([1, 3, 2, 0]);
  });

  it('honours a call-specific source ahead of the configured one', () => {
    const configured = vi.fn(() => 0.5);
    setRandomSource(configured);
    const keys = [0.8, 0.1, 0.6, 0.2];
    expect(getRandomQualifierList({ drawDefinition: drawDefinition(), random: () => keys.shift()! })).toEqual([
      1, 3, 2, 0,
    ]);
    expect(configured).not.toHaveBeenCalled();
  });

  it.each([0, 1])('handles %i placeholders without altering the draw', (count) => {
    const draw = drawDefinition(count);
    const before = structuredClone(draw);
    expect(getRandomQualifierList({ drawDefinition: draw, random: () => 0.5 })).toEqual(count ? [0] : []);
    expect(draw).toEqual(before);
  });
});
