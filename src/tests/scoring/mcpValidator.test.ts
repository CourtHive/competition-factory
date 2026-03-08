import { mcpValidator, validateMCPMatch, exportMatchUpJSON } from '@Validators/scoring/mcpValidator';
import { groupByMatch, parseCSV } from '@Validators/scoring/mcpParser';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs-extra';
import { resolve } from 'path';

describe('mcpValidator - Match Validation', () => {
  const testDataPath = resolve(__dirname, 'fixtures/mcp-data/testing.csv');

  describe('CSV Parsing and Match Grouping', () => {
    it('should parse CSV data', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);

      expect(points.length).toBeGreaterThan(0);
      expect(points[0]).toHaveProperty('match_id');
      expect(points[0]).toHaveProperty('1st');
      expect(points[0]).toHaveProperty('2nd');
    });

    it('should group points by match', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]).toHaveProperty('match_id');
      expect(matches[0]).toHaveProperty('points');
      expect(matches[0].points.length).toBeGreaterThan(0);
    });
  });

  describe('Single Match Validation', () => {
    it('should validate a single match', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      expect(matches.length).toBeGreaterThan(0);

      const result = validateMCPMatch(matches[0]);

      expect(result).toBeDefined();
      expect(result.matchUp).toBeDefined();
      expect(result.pointsProcessed).toBeGreaterThan(0);
      expect(result.matchUp.matchUpId).toBe(matches[0].match_id);
      expect(result.matchUp.sides).toHaveLength(2);
      expect(result.matchUp.sides[0].participant?.participantName).toBeTruthy();
      expect(result.matchUp.sides[1].participant?.participantName).toBeTruthy();
    });

    it('should include decorated points in history', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);

      expect(result.matchUp.history).toBeDefined();
      expect(result.matchUp.history!.points).toBeDefined();
      expect(result.matchUp.history!.points.length).toBeGreaterThan(0);

      // Check that points have decorations
      const decoratedPoints = result.matchUp.history!.points.filter((p) => p.result || p.stroke || p.serve);
      expect(decoratedPoints.length).toBeGreaterThan(0);

      // Check for specific decorations
      const hasAce = result.matchUp.history!.points.some((p) => p.result === 'Ace');
      const hasWinner = result.matchUp.history!.points.some((p) => p.result === 'Winner');
      const hasServeLocation = result.matchUp.history!.points.some((p) => p.serveLocation !== undefined);

      // At least some decorated points should exist
      expect(hasAce || hasWinner || hasServeLocation).toBe(true);
    });

    it('should track statistics', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);

      // Stats should be non-negative
      expect(result.aces).toBeGreaterThanOrEqual(0);
      expect(result.doubleFaults).toBeGreaterThanOrEqual(0);
      expect(result.winners).toBeGreaterThanOrEqual(0);
      expect(result.unforcedErrors).toBeGreaterThanOrEqual(0);
      expect(result.forcedErrors).toBeGreaterThanOrEqual(0);

      // At least some stats should be present
      const totalStats =
        result.aces + result.doubleFaults + result.winners + result.unforcedErrors + result.forcedErrors;
      expect(totalStats).toBeGreaterThan(0);
    });

    it('should validate score progression', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0], { debug: false });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.matchUp.score.sets.length).toBeGreaterThan(0);
    });
  });

  describe('Full CSV Validation', () => {
    it('should validate all matches in CSV', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const result = mcpValidator({ csvData });

      expect(result.matchesProcessed).toBeGreaterThan(0);
      expect(result.pointsProcessed).toBeGreaterThan(0);
      expect(result.matchUps).toHaveLength(result.matchesProcessed);
      expect(result.valid).toBe(true);
    });

    it('should report statistics across all matches', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const result = mcpValidator({ csvData });

      expect(result.totalAces).toBeGreaterThan(0);
      expect(result.totalWinners).toBeGreaterThan(0);

      // Total stats should be sum of individual matches
      let sumAces = 0;
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      for (const match of matches) {
        const matchResult = validateMCPMatch(match);
        sumAces += matchResult.aces;
      }

      expect(result.totalAces).toBe(sumAces);
    });

    it('should filter by matchId', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const targetMatchId = matches[0].match_id;
      const result = mcpValidator({ csvData, matchId: targetMatchId });

      expect(result.matchesProcessed).toBe(1);
      expect(result.matchUps[0].matchUpId).toBe(targetMatchId);
    });

    it('should handle invalid matchId', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const result = mcpValidator({
        csvData,
        matchId: 'nonexistent-match-id',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.matchesProcessed).toBe(0);
    });
  });

  describe('Point Decorations', () => {
    it('should include rally sequences', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);

      const pointsWithRally = result.matchUp.history!.points.filter((p) => p.rally && p.rally.length > 0);

      expect(pointsWithRally.length).toBeGreaterThan(0);

      // Check rally structure
      const rallyPoint = pointsWithRally[0];
      expect(rallyPoint.rally![0]).toHaveProperty('shotNumber');
      expect(rallyPoint.rally![0]).toHaveProperty('player');
      expect(rallyPoint.rally![0]).toHaveProperty('stroke');
    });

    it('should include serve locations', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);

      const pointsWithServeLocation = result.matchUp.history!.points.filter((p) => p.serveLocation !== undefined);

      expect(pointsWithServeLocation.length).toBeGreaterThan(0);

      // Check serve locations are valid
      const locations = new Set(pointsWithServeLocation.map((p) => p.serveLocation));
      expect(locations.size).toBeGreaterThan(0);

      // All should be valid values
      for (const loc of locations) {
        expect(['Wide', 'Body', 'T']).toContain(loc);
      }
    });

    it('should include stroke types', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);

      const pointsWithStrokes = result.matchUp.history!.points.filter((p) => p.stroke !== undefined);

      expect(pointsWithStrokes.length).toBeGreaterThan(0);

      // Should have variety of strokes
      const strokes = new Set(pointsWithStrokes.map((p) => p.stroke));
      expect(strokes.size).toBeGreaterThan(1);
    });

    it('should include result types', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);

      const pointsWithResults = result.matchUp.history!.points.filter((p) => p.result !== undefined);

      expect(pointsWithResults.length).toBeGreaterThan(0);

      // Should have variety of results
      const results = new Set(pointsWithResults.map((p) => p.result));
      expect(results.size).toBeGreaterThan(1);

      // Check for common result types
      const hasAce = Array.from(results).includes('Ace');
      const hasWinner = Array.from(results).includes('Winner');
      const hasError = Array.from(results).includes('Unforced Error') || Array.from(results).includes('Forced Error');

      expect(hasAce || hasWinner || hasError).toBe(true);
    });
  });

  describe('JSON Export', () => {
    it('should export MatchUp to JSON', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);
      const json = exportMatchUpJSON(result.matchUp);

      expect(json).toBeTruthy();
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.matchUpId).toBe(matches[0].match_id);
      expect(parsed.sides).toHaveLength(2);
      expect(parsed.history).toBeDefined();
      expect(parsed.history.points).toBeDefined();
    });

    it('should include all decorations in JSON export', () => {
      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      const result = validateMCPMatch(matches[0]);
      const json = exportMatchUpJSON(result.matchUp);
      const parsed = JSON.parse(json);

      // Check that decorations are preserved in JSON
      const firstPoint = parsed.history.points[0];
      expect(firstPoint).toHaveProperty('winner');
      expect(firstPoint).toHaveProperty('server');

      // Should have some decorated points
      const decoratedCount = parsed.history.points.filter((p: any) => p.result || p.stroke || p.serveLocation).length;
      expect(decoratedCount).toBeGreaterThan(0);
    });
  });

  describe('Debug Mode', () => {
    it('should provide debug output when enabled', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const csvData = readFileSync(testDataPath, 'utf-8');
      const points = parseCSV(csvData);
      const matches = groupByMatch(points);

      // Just verify it doesn't crash with debug enabled
      const result = validateMCPMatch(matches[0], { debug: true });
      expect(result).toBeDefined();
      expect(result.valid).toBe(true);

      vi.restoreAllMocks();
    });
  });
});
