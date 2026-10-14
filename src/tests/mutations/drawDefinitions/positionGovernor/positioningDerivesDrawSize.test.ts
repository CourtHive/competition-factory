import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

/**
 * automatedPositioning without `drawSize` takes the size from the structure.
 *
 * TMX positions a structure without passing drawSize, and so do playoff and voluntary consolation positioning.
 * Unseeded placement shuffled only when `drawSize > 2`, so with drawSize omitted every seed gave the same draw:
 * entrants filled the open positions in entry order.
 */
function shellDraw(drawSize: number, participantsCount: number) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, participantsCount, seedsCount: 0, automated: false }],
    nonRandom: 1,
  });
  const { structureId } = tournamentRecord.events[0].drawDefinitions[0].structures[0];
  const position = (nonRandom: number, explicitDrawSize?: number) => {
    tournamentEngine.setState(structuredClone(tournamentRecord));
    const result = tournamentEngine.automatedPositioning({
      ...(explicitDrawSize && { drawSize: explicitDrawSize }),
      structureId,
      nonRandom,
      drawId,
    });
    expect(result.success).toEqual(true);
    return result.positionAssignments.map(({ drawPosition, participantId, bye }) => [
      drawPosition,
      participantId ?? bye,
    ]);
  };
  return { position };
}

describe('automatedPositioning derives drawSize from the structure', () => {
  it('an omitted drawSize positions exactly as the structure size does, seed by seed', () => {
    const { position } = shellDraw(16, 12);
    for (const seed of [1, 2, 3]) expect(position(seed)).toEqual(position(seed, 16));
  });

  it('an omitted drawSize no longer gives every seed the same draw', () => {
    const { position } = shellDraw(16, 12);
    const draws = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(position(seed))));
    expect(draws.size).toBeGreaterThan(1);
  });

  it('a two-position structure keeps its entry order, with or without drawSize', () => {
    const { position } = shellDraw(2, 2);
    expect(position(1)).toEqual(position(1, 2));
    expect(position(1)).toEqual(position(2));
  });
});
