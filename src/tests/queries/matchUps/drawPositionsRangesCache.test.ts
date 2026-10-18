import { clearDrawPositionsRangesCache } from '@Query/matchUps/getDrawPositionsRanges';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * Hydration caches the draw-position ranges by the inputs they are computed from (getDrawPositionsRanges), because
 * one `setMatchUpStatus` hydrates the whole draw six to eight times and the ranges were ~35% of a hydration. A hit
 * must be exactly what a cold computation gives, at every state the draw passes through, and a consumer mutating a
 * hydrated matchUp must not reach the next hydration.
 */

const hydrate = () =>
  tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: ['d1'] }, inContext: true }).matchUps;

const ranges = (matchUps: any[]) =>
  matchUps
    .map(({ matchUpId, drawPositionsRange }) => ({ matchUpId, drawPositionsRange }))
    .sort((a, b) => a.matchUpId.localeCompare(b.matchUpId));

describe('a cached hydration is a cold hydration', () => {
  it.each([
    [SINGLE_ELIMINATION, 32],
    [SINGLE_ELIMINATION, 16, 13], // three BYEs
    [FEED_IN_CHAMPIONSHIP, 32],
    [COMPASS, 32],
    [CURTIS_CONSOLATION, 32],
    [DOUBLE_ELIMINATION, 16],
    [FIRST_MATCH_LOSER_CONSOLATION, 16],
    [ROUND_ROBIN_WITH_PLAYOFF, 16],
  ] as const)('%s %s, at every step of completing it', (drawType, drawSize, participantsCount?: number) => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd1', drawSize, drawType, participantsCount }],
      nonRandom: 1,
      setState: true,
    });
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });

    clearDrawPositionsRangesCache();
    let steps = 0;
    for (;;) {
      // warm first: the cache holds what every EARLIER state of the draw put there, so a key too loose to tell this
      // state from an earlier one returns the earlier ranges here
      const warm = ranges(hydrate());
      clearDrawPositionsRangesCache();
      const cold = ranges(hydrate());
      expect(warm).toEqual(cold);
      expect(cold.some(({ drawPositionsRange }) => drawPositionsRange)).toEqual(true);

      const ready = hydrate().find((m: any) => m.readyToScore && !m.winningSide && m.matchUpStatus !== 'BYE');
      if (!ready) break;
      const result = tournamentEngine.setMatchUpStatus({ drawId: 'd1', matchUpId: ready.matchUpId, outcome });
      expect(result.success).toEqual(true);
      steps += 1;
    }
    expect(steps).toBeGreaterThan(0);
  });
});

describe('one cache serves every draw', () => {
  it('draws of different shapes, hydrated one after another without clearing, each get their own ranges', () => {
    const shapes: [string, number, number?][] = [
      [SINGLE_ELIMINATION, 16],
      [SINGLE_ELIMINATION, 16, 13],
      [FEED_IN_CHAMPIONSHIP, 16],
      [CURTIS_CONSOLATION, 32],
      [FIRST_MATCH_LOSER_CONSOLATION, 16],
      [COMPASS, 16],
      [DOUBLE_ELIMINATION, 16],
      [ROUND_ROBIN_WITH_PLAYOFF, 16],
    ];
    // each completed draw generated once and reloaded, so the test spends its time hydrating
    const records = shapes.map(([drawType, drawSize, participantsCount]) =>
      JSON.stringify(
        mocksEngine.generateTournamentRecord({
          drawProfiles: [{ drawId: 'd1', drawSize, drawType, participantsCount }],
          completeAllMatchUps: true,
          nonRandom: 1,
        }).tournamentRecord,
      ),
    );
    const load = (record: string) => tournamentEngine.setState(JSON.parse(record));

    const cold = records.map((record) => {
      load(record);
      clearDrawPositionsRangesCache();
      return ranges(hydrate());
    });

    clearDrawPositionsRangesCache();
    records.forEach((record) => {
      load(record);
      hydrate();
    });
    const warm = records.map((record) => {
      load(record);
      return ranges(hydrate()); // the cache holds every shape hydrated before it
    });
    expect(warm).toEqual(cold);
  }, 180_000);
});

describe('the cache hands out copies', () => {
  it('mutating a hydrated matchUp does not change the next hydration', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd1', drawSize: 16 }],
      nonRandom: 1,
      setState: true,
    });
    clearDrawPositionsRangesCache();

    const expected = ranges(hydrate()); // cold: computes and stores
    const served = hydrate(); // a hit: what a consumer holds when the cache answered
    const final = served.find((m: any) => m.roundNumber === 4);
    final.drawPositionsRange.possibleDrawPositions.push(99);
    final.drawPositionsRange.drawPositionsRange = 'mutated';

    expect(ranges(hydrate())).toEqual(expected);
  });
});
