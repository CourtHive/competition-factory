import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';

/**
 * Completing a lucky draw never makes the lucky loser choice: a round fed by a lucky loser keeps an open
 * position until one is placed, so the driver stops before it by itself. TMX's "Complete all matchUps"
 * control relies on that, so it is pinned here, and the result names the round that waits, so a caller
 * can hand the choice on rather than infer it.
 */
describe('completeDrawMatchUps at a lucky loser boundary', () => {
  function generate(drawSize: number) {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize, drawType: LUCKY_DRAW }], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    return { drawId, structureId: drawDefinition.structures[0].structureId };
  }

  function playedByRound(drawId: string): number[] {
    const matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
    const roundNumbers = [...new Set(matchUps.map((m) => m.roundNumber))].sort((a: any, b: any) => a - b);
    return roundNumbers.map(
      (roundNumber) => matchUps.filter((m) => m.roundNumber === roundNumber && m.winningSide).length,
    );
  }

  // drawSize -> the matchUps played in each round, and the round whose lucky loser is awaited
  const cases: [number, number[], number][] = [
    [12, [6, 3, 0, 0], 2], // 6 -> 3: round 2 is odd, round 3 waits on one lucky loser
    [24, [12, 6, 3, 0, 0], 3],
    [44, [22, 11, 0, 0, 0, 0], 2],
    [48, [24, 12, 6, 3, 0, 0], 4],
  ];

  test.each(cases)('drawSize %i plays up to the choice and names the round', (drawSize, played, roundNumber) => {
    const { drawId, structureId } = generate(drawSize);

    const result: any = tournamentEngine.completeDrawMatchUps({ completeAllMatchUps: true, drawId });
    expect(result.success).toEqual(true);
    expect(playedByRound(drawId)).toEqual(played);
    expect(result.awaitingLuckySelection).toEqual([{ structureId, roundNumber }]);
    expect(result.completedCount).toEqual(played.reduce((a, b) => a + b, 0));

    // the same round the lucky draw status reports
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId, structureId });
    expect(status.rounds.filter((round) => round.needsLuckySelection).map((round) => round.roundNumber)).toEqual([
      roundNumber,
    ]);
  });

  test('a draw that is not lucky reports nothing', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });
    const result: any = tournamentEngine.completeDrawMatchUps({ completeAllMatchUps: true, drawId });
    expect(result.completedCount).toEqual(7);
    expect(result.awaitingLuckySelection).toBeUndefined();
  });
});
