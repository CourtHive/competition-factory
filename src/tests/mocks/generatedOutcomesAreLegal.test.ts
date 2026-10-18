import { generateOutcome } from '@Generators/mocks/generateOutcome';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { createSeededRandom } from '@Tools/prng';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, DEFAULTED } from '@Constants/matchUpStatusConstants';

/**
 * A generated outcome is one the engine accepts (2026-10-17 mocks assessment, M4).
 *
 * - Combined point totals (`SET1-S:P32`, `P32DP`, `P32WB2`) came back COMPLETED with an empty score and
 *   no winner in 30 of 30 seeds; a draw completed with them refused downstream. They are now generated
 *   decisive: the loser takes fewer than half the total. A level total is never generated, because
 *   whether it is legal depends on the structure (decision D1, by opposed debate agents who agreed).
 * - `SET1-S:5WB1` generated sets such as 5-7, which should have ended at 5-4 (5 of 30 seeds).
 *
 * Every other format family draws exactly what it drew before, so no existing seed changes.
 */

const SEEDS = 120;
const COMPLETED_ONLY = {};

function outcomesOf(matchUpFormat: string, winningSide?: number, matchUpStatusProfile: any = COMPLETED_ONLY) {
  return Array.from({ length: SEEDS }, (_, seed) => {
    const result: any = generateOutcome({
      matchUpFormat,
      matchUpStatusProfile,
      winningSide,
      random: createSeededRandom(seed + 1),
    });
    expect(result.error, `${matchUpFormat} seed ${seed + 1}`).toBeUndefined();
    return result.outcome;
  });
}

const isLegal = (outcome: any, matchUpFormat: string) =>
  analyzeMatchUp({ matchUp: { score: outcome.score, winningSide: outcome.winningSide, matchUpFormat }, matchUpFormat })
    .validMatchUpOutcome;

describe('combined point totals', () => {
  const FORMATS = [
    'SET1-S:P32',
    'SET1-S:P31',
    'SET1-S:P4',
    'SET1-S:P1',
    'SET1-S:P32DP',
    'SET1-S:P4DP',
    'SET1-S:P32WB2',
    'SET1-S:P4WB3',
  ];

  for (const matchUpFormat of FORMATS) {
    it(`${matchUpFormat}: every outcome is complete, decisive, scored and legal`, () => {
      const total = Number(/P(\d+)/.exec(matchUpFormat)?.[1]);
      for (const outcome of outcomesOf(matchUpFormat)) {
        expect(outcome.matchUpStatus).toEqual(COMPLETED);
        expect([1, 2]).toContain(outcome.winningSide);
        expect(outcome.score.scoreStringSide1).not.toEqual('');
        const [set] = outcome.score.sets;
        expect(set.side1Score + set.side2Score).toEqual(total);
        expect(set.side1Score).not.toEqual(set.side2Score);
        expect(isLegal(outcome, matchUpFormat), JSON.stringify(set)).toEqual(true);
      }
    });
  }

  it('a requested winner wins', () => {
    for (const winningSide of [1, 2]) {
      for (const outcome of outcomesOf('SET1-S:P32', winningSide)) expect(outcome.winningSide).toEqual(winningSide);
    }
  });

  it('a default with a score stops short of the total', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { outcome }: any = generateOutcome({
        matchUpStatusProfile: { [DEFAULTED]: 100 },
        random: createSeededRandom(seed),
        defaultWithScorePercent: 100,
        matchUpFormat: 'SET1-S:P32',
      });
      expect(outcome.matchUpStatus).toEqual(DEFAULTED);
      const [set] = outcome.score.sets;
      expect(set.side1Score + set.side2Score).toBeLessThan(32);
    }
  });

  it('a round robin completed at P32 completes every matchUp', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawId: 'p', drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: 'SET1-S:P32', completeAllMatchUps: true },
      ],
      setState: true,
    });
    expect(result.success).toEqual(true);
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: 'p' });
    expect(matchUps.length).toEqual(6);
    for (const matchUp of matchUps) expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  });

  it('an elimination draw completed at P31 completes every matchUp', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId: 'e',
          drawSize: 8,
          drawType: SINGLE_ELIMINATION,
          matchUpFormat: 'SET1-S:P31',
          completeAllMatchUps: true,
        },
      ],
      setState: true,
    });
    expect(result.success).toEqual(true);
    for (const matchUp of tournamentEngine.allDrawMatchUps({ drawId: 'e' }).matchUps)
      expect(matchUp.winningSide).toBeDefined();
  });
});

describe('a one-game margin without a tiebreak', () => {
  it('SET1-S:5WB1 ends when a side reaches 5', () => {
    for (const outcome of outcomesOf('SET1-S:5WB1')) {
      const [set] = outcome.score.sets;
      expect(Math.max(set.side1Score, set.side2Score), JSON.stringify(set)).toEqual(5);
      expect(Math.min(set.side1Score, set.side2Score)).toBeLessThan(5);
      expect(isLegal(outcome, 'SET1-S:5WB1')).toEqual(true);
    }
  });
});

/**
 * The generator draws its losing scores from 1 upward (so 6-0 and 7-6(0) never appear by seed), and
 * changing that would move every existing seed. These boundaries are authored instead, through the
 * same completion path a fixture uses.
 */
describe('authored boundary scores complete through the fixture path', () => {
  for (const scoreString of ['6-0 6-0', '7-6(0) 6-0', '0-6 7-6(0) 6-0', '7-5 7-6(10)']) {
    it(scoreString, () => {
      const result: any = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawId: 'b', drawSize: 4, completeAllMatchUps: scoreString }],
        setState: true,
      });
      expect(result.success).toEqual(true);
      for (const matchUp of tournamentEngine.allDrawMatchUps({ drawId: 'b' }).matchUps) {
        expect(matchUp.matchUpStatus).toEqual(COMPLETED);
        expect(matchUp.score?.scoreStringSide1).toEqual(scoreString);
      }
    });
  }
});
