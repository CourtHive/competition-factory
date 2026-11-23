import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { FEED_IN_CHAMPIONSHIP, MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * "Complete one round of the structure on screen": `roundsToComplete` bounds completion per structure,
 * counted from that structure's first round still to play when the call starts.
 */
describe('completeDrawMatchUps roundsToComplete', () => {
  function generate(drawProfile) {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    return { drawId, drawDefinition };
  }

  function played(drawId: string, structureId?: string): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const matchUp of tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps) {
      if (
        !matchUp.winningSide ||
        (structureId && matchUp.containerStructureId !== structureId && matchUp.structureId !== structureId)
      )
        continue;
      counts[matchUp.roundNumber] = (counts[matchUp.roundNumber] ?? 0) + 1;
    }
    return counts;
  }

  test('one round, then the next two, of an elimination structure', () => {
    const { drawId, drawDefinition } = generate({ drawSize: 16 });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.completeDrawMatchUps({
      drawId,
      structureIds: [structureId],
      roundsToComplete: 1,
    });
    expect(result.success).toEqual(true);
    expect(result.completedCount).toEqual(8);
    expect(played(drawId)).toEqual({ 1: 8 });

    result = tournamentEngine.completeDrawMatchUps({ drawId, structureIds: [structureId], roundsToComplete: 2 });
    expect(result.completedCount).toEqual(6);
    expect(played(drawId)).toEqual({ 1: 8, 2: 4, 3: 2 });

    result = tournamentEngine.completeDrawMatchUps({ drawId, structureIds: [structureId], roundsToComplete: 5 });
    expect(result.completedCount).toEqual(1);
    expect(result.remainingCount).toEqual(0);

    // nothing left to play: a bound that admits nothing, not an error
    result = tournamentEngine.completeDrawMatchUps({ drawId, structureIds: [structureId], roundsToComplete: 1 });
    expect(result.success).toEqual(true);
    expect(result.completedCount).toEqual(0);
  });

  test('a round of a round robin is that round in every group', () => {
    const { drawId, drawDefinition } = generate({ drawSize: 16, drawType: ROUND_ROBIN });
    const structureId = drawDefinition.structures[0].structureId;

    const result: any = tournamentEngine.completeDrawMatchUps({
      drawId,
      structureIds: [structureId],
      roundsToComplete: 1,
    });
    expect(result.completedCount).toEqual(8);
    expect(played(drawId)).toEqual({ 1: 8 });
  });

  test('scoped to the main structure, a fed consolation is left alone', () => {
    const { drawId, drawDefinition } = generate({ drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP });
    const main = drawDefinition.structures.find(({ stage }) => stage === MAIN);
    const consolation = drawDefinition.structures.find(({ stage }) => stage !== MAIN);

    tournamentEngine.completeDrawMatchUps({ drawId, structureIds: [main.structureId], roundsToComplete: 1 });
    expect(played(drawId, main.structureId)).toEqual({ 1: 8 });
    expect(played(drawId, consolation.structureId)).toEqual({});

    // unscoped, each structure is bounded from its own first open round
    tournamentEngine.completeDrawMatchUps({ drawId, roundsToComplete: 1 });
    expect(played(drawId, main.structureId)).toEqual({ 1: 8, 2: 4 });
    expect(played(drawId, consolation.structureId)).toEqual({ 1: 4 });
  });

  test('refuses a count that is not a positive integer', () => {
    const { drawId } = generate({ drawSize: 8 });
    for (const roundsToComplete of [0, -1, 1.5, '1']) {
      const result: any = tournamentEngine.completeDrawMatchUps({ drawId, roundsToComplete });
      expect(result.error).toEqual(INVALID_VALUES);
    }
    expect(played(drawId)).toEqual({});
  });
});
