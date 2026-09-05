import { calculatePressureRatings, getSideValues } from '@Query/matchUps/roundRobinTally/calculatePressureRatings';
import { describe, expect, it } from 'vitest';

describe('calculatePressureRatings', () => {
  // getSideValues tests
  describe('getSideValues', () => {
    it('calculates pressure values from ratings and score', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1600,
        score: {
          sets: [
            { side1Score: 6, side2Score: 3 },
            { side1Score: 6, side2Score: 4 },
          ],
        },
      });

      expect(result).toBeDefined();
      expect(result.side1pressure).toBeDefined();
      expect(result.side2pressure).toBeDefined();
      expect(typeof result.side1pressure).toBe('number');
      expect(typeof result.side2pressure).toBe('number');
    });

    it('handles equal ratings', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1500,
        score: {
          sets: [
            { side1Score: 6, side2Score: 4 },
            { side1Score: 6, side2Score: 2 },
          ],
        },
      });

      expect(result.side1pressure).toBeDefined();
      expect(result.side2pressure).toBeDefined();
    });

    it('handles large rating differences', () => {
      const result = getSideValues({
        side1ConvertedRating: 2000,
        side2ConvertedRating: 1000,
        score: {
          sets: [
            { side1Score: 6, side2Score: 0 },
            { side1Score: 6, side2Score: 1 },
          ],
        },
      });

      expect(result.side1pressure).toBeGreaterThan(0);
      expect(result.side2pressure).toBeGreaterThanOrEqual(0);
    });

    it('handles zero score', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1600,
        score: {
          sets: [{ side1Score: 0, side2Score: 0 }],
        },
      });

      expect(result.side1pressure).toBe(0);
      expect(result.side2pressure).toBe(0);
    });

    it('handles missing score', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1600,
        score: undefined,
      });

      expect(result.side1pressure).toBe(0);
      expect(result.side2pressure).toBe(0);
    });

    it('handles undefined set scores', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1600,
        score: {
          sets: [{ side1Score: undefined, side2Score: undefined }],
        },
      });

      expect(result).toBeDefined();
    });

    it('sums pressure values to 1', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1600,
        score: {
          sets: [
            { side1Score: 6, side2Score: 3 },
            { side1Score: 6, side2Score: 4 },
          ],
        },
      });

      const sum = result.side1pressure + result.side2pressure;
      expect(sum).toBeCloseTo(1, 2);
    });

    it('handles three-set matches', () => {
      const result = getSideValues({
        side1ConvertedRating: 1500,
        side2ConvertedRating: 1600,
        score: {
          sets: [
            { side1Score: 6, side2Score: 4 },
            { side1Score: 3, side2Score: 6 },
            { side1Score: 7, side2Score: 5 },
          ],
        },
      });

      expect(result.side1pressure).toBeGreaterThan(0);
      expect(result.side2pressure).toBeGreaterThan(0);
    });
  });

  // calculatePressureRatings integration tests
  describe('calculatePressureRatings - integration', () => {
    it('does not update when ratings missing', () => {
      const participantResults = {
        p1: { pressureScores: [], ratingVariation: [] },
        p2: { pressureScores: [], ratingVariation: [] },
      };

      const sides = [
        {
          sideNumber: 1,
          participantId: 'p1',
          participant: {},
        },
        {
          sideNumber: 2,
          participantId: 'p2',
          participant: {},
        },
      ];

      const score = {
        sets: [{ side1Score: 6, side2Score: 3 }],
      };

      calculatePressureRatings({ participantResults, sides, score });

      expect(participantResults.p1.pressureScores).toHaveLength(0);
      expect(participantResults.p2.pressureScores).toHaveLength(0);
    });

    it('handles undefined sides', () => {
      const participantResults = {
        p1: { pressureScores: [], ratingVariation: [] },
        p2: { pressureScores: [], ratingVariation: [] },
      };

      calculatePressureRatings({
        participantResults,
        sides: undefined,
        score: { sets: [{ side1Score: 6, side2Score: 3 }] },
      });

      expect(participantResults.p1.pressureScores).toHaveLength(0);
    });

    it('handles sides without participants', () => {
      const participantResults = {};

      const sides = [{ sideNumber: 1 }, { sideNumber: 2 }];

      const score = {
        sets: [{ side1Score: 6, side2Score: 3 }],
      };

      calculatePressureRatings({ participantResults, sides, score });

      expect(Object.keys(participantResults)).toHaveLength(0);
    });
  });
});
