import { mcpValidator, validateMCPMatch, exportMatchUpJSON } from '@Validators/scoring/mcpValidator';
import type { MCPMatch, MCPPoint } from '@Validators/scoring/mcpParser';
import { describe, it, expect } from 'vitest';

// Helper to create a minimal MCPPoint with no Set values (avoids bad format deduction)
function makeMCPPoint(overrides: Partial<MCPPoint> = {}): MCPPoint {
  return {
    match_id: '20200101-M-TestTournament-F-Player_One-Player_Two',
    Pt: '1',
    Set1: '',
    Set2: '',
    Gm1: '0',
    Gm2: '0',
    Pts: '0-0',
    Svr: '1',
    Ret: '2',
    '1st': '4f1*',
    '2nd': '',
    PtWinner: '1',
    isAce: 'FALSE',
    isDouble: 'FALSE',
    isUnforced: 'FALSE',
    isForced: 'FALSE',
    isRallyWinner: 'TRUE',
    rallyCount: '2',
    ...overrides,
  };
}

// Helper to build a minimal CSV string from MCPPoints
function buildCSV(points: MCPPoint[]): string {
  if (points.length === 0)
    return 'match_id,Pt,Set1,Set2,Gm1,Gm2,Pts,Svr,Ret,1st,2nd,PtWinner,isAce,isDouble,isUnforced,isForced,isRallyWinner,rallyCount\n';
  const headers = Object.keys(points[0]);
  const lines = [headers.join(',')];
  for (const point of points) {
    lines.push(headers.map((h) => point[h] || '').join(','));
  }
  return lines.join('\n');
}

// Helper to make a minimal MCPMatch
function makeMCPMatch(overrides: Partial<MCPMatch> = {}): MCPMatch {
  return {
    match_id: '20200101-M-TestTournament-F-Player_One-Player_Two',
    points: [makeMCPPoint()],
    ...overrides,
  };
}

describe('mcpValidator - Branch Coverage', () => {
  // ========================================================================
  // parseMatchId branches
  // ========================================================================
  describe('parseMatchId (via validateMCPMatch)', () => {
    it('should use default names when match_id has fewer than 6 parts', () => {
      const match = makeMCPMatch({
        match_id: 'short-id',
        points: [makeMCPPoint({ match_id: 'short-id' })],
      });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchUp.sides[0].participant?.participantName).toBe('Player 1');
      expect(result.matchUp.sides[1].participant?.participantName).toBe('Player 2');
    });

    it('should parse player names from well-formed match_id', () => {
      const match = makeMCPMatch({
        match_id: '20200101-M-Australian_Open-F-Roger_Federer-Novak_Djokovic',
        points: [makeMCPPoint({ match_id: '20200101-M-Australian_Open-F-Roger_Federer-Novak_Djokovic' })],
      });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchUp.sides[0].participant?.participantName).toBe('Roger Federer');
      expect(result.matchUp.sides[1].participant?.participantName).toBe('Novak Djokovic');
    });

    it('should handle empty match_id gracefully', () => {
      const match = makeMCPMatch({
        match_id: '',
        points: [makeMCPPoint({ match_id: '' })],
      });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchUp.sides[0].participant?.participantName).toBe('Player 1');
      expect(result.matchUp.sides[1].participant?.participantName).toBe('Player 2');
    });

    it('should handle match_id with exactly 6 parts but missing player names', () => {
      // parts[4] and parts[5] are empty => fallback to 'Player 1'/'Player 2'
      const match = makeMCPMatch({
        match_id: '20200101-M-Test-F--',
        points: [makeMCPPoint({ match_id: '20200101-M-Test-F--' })],
      });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      // Empty strings are falsy, so fallback to 'Player 1'/'Player 2'
      expect(result.matchUp.sides[0].participant?.participantName).toBe('Player 1');
      expect(result.matchUp.sides[1].participant?.participantName).toBe('Player 2');
    });
  });

  // ========================================================================
  // extractFinalScore branches (tested indirectly via validateMCPMatch)
  // ========================================================================
  describe('extractFinalScore branches', () => {
    it('should return undefined for empty points array', () => {
      const match: MCPMatch = {
        match_id: '20200101-M-Test-F-A-B',
        points: [],
      };

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.expectedScore).toBeUndefined();
      expect(result.pointsProcessed).toBe(0);
    });

    it('should handle points without Set1/Set2 values', () => {
      const point = makeMCPPoint({ Set1: '', Set2: '' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.expectedScore).toBeUndefined();
    });

    it('should construct expected score from Set1 and Set2', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.expectedScore).toBeDefined();
      expect(result.expectedScore).toContain('6-4');
    });

    it('should handle points with Set3/Set4/Set5 properties', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      (point as any).Set3 = '7';
      (point as any).Set4 = '6';
      (point as any).Set5 = '3';

      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET5-S:6/TB7' });
      expect(result.expectedScore).toBeDefined();
    });
  });

  // ========================================================================
  // validateMCPMatch format deduction branches
  // ========================================================================
  describe('validateMCPMatch format branches', () => {
    it('should use provided matchUpFormat when given', () => {
      const match = makeMCPMatch();
      const result = validateMCPMatch(match, { matchUpFormat: 'SET1-S:6/TB7' });

      expect(result.formatDeduced).toBe(false);
      expect(result.matchUp).toBeDefined();
    });

    it('should deduce format from expected score when available', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const match = makeMCPMatch({ points: [point] });

      // No provided format => deduces from expected score "6-4"
      const result = validateMCPMatch(match);
      expect(result.formatDeduced).toBe(true);
      expect(result.expectedScore).toBeDefined();
    });

    it('should use default format when no expected score and no provided format', () => {
      const point = makeMCPPoint({ Set1: '', Set2: '' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match);
      expect(result.formatDeduced).toBe(true);
      expect(result.warnings).toContain('No format provided, using default SET3-S:6/TB7');
    });
  });

  // ========================================================================
  // validateMCPMatch debug branches
  // ========================================================================
  describe('validateMCPMatch debug mode', () => {
    it('should run with debug=true and deduced format from expected score', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { debug: true });
      expect(result).toBeDefined();
      expect(result.formatDeduced).toBe(true);
    });

    it('should run with debug=true and no expected score (default format)', () => {
      const point = makeMCPPoint({ Set1: '', Set2: '' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { debug: true });
      expect(result).toBeDefined();
      expect(result.warnings).toContain('No format provided, using default SET3-S:6/TB7');
    });

    it('should log debug info for first 5 and last points', () => {
      // Create enough points to test the i < 5 || i === last branch
      const points: MCPPoint[] = [];
      for (let i = 0; i < 10; i++) {
        points.push(
          makeMCPPoint({
            Pt: String(i + 1),
            PtWinner: i % 2 === 0 ? '1' : '2',
            Svr: '1',
            '1st': '4f1*',
            '2nd': '',
          }),
        );
      }
      const match = makeMCPMatch({ points });

      // Provide a valid format to avoid deduction issues
      const result = validateMCPMatch(match, { debug: true, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.pointsProcessed).toBe(10);
    });
  });

  // ========================================================================
  // validateMCPMatch error handling (catch block)
  // ========================================================================
  describe('validateMCPMatch error handling in point processing', () => {
    it('should handle errors from addPoint with debug mode', () => {
      // Create many identical points to exhaust a short format
      const points: MCPPoint[] = [];
      for (let i = 0; i < 200; i++) {
        points.push(
          makeMCPPoint({
            Pt: String(i + 1),
            PtWinner: '1',
            Svr: '1',
            '1st': '4*',
            '2nd': '',
          }),
        );
      }
      const match = makeMCPMatch({
        match_id: '20200101-M-Test-F-Player_A-Player_B',
        points,
      });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET1-S:4/TB7', debug: true });
      // Some points should process; match should eventually complete or error
      expect(result.pointsProcessed).toBeGreaterThan(0);
    });

    it('should collect errors without debug mode', () => {
      const points: MCPPoint[] = [];
      for (let i = 0; i < 200; i++) {
        points.push(
          makeMCPPoint({
            Pt: String(i + 1),
            PtWinner: '1',
            Svr: '1',
            '1st': '4*',
            '2nd': '',
          }),
        );
      }
      const match = makeMCPMatch({
        match_id: '20200101-M-Test-F-Player_A-Player_B',
        points,
      });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET1-S:4/TB7', debug: false });
      expect(result.pointsProcessed).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // validateMCPMatch score validation branches
  // ========================================================================
  describe('validateMCPMatch score validation', () => {
    it('should skip score validation when validateScore is false', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { validateScore: false, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.scoreMatches).toBeUndefined();
    });

    it('should detect score mismatch when expected differs from actual', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { validateScore: true, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.scoreMatches).toBe(false);
      expect(result.errors.some((e) => e.includes('Score mismatch'))).toBe(true);
    });

    it('should validate score with debug enabled', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { validateScore: true, debug: true, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.scoreMatches).toBeDefined();
    });

    it('should skip score comparison when expectedScore is undefined', () => {
      const point = makeMCPPoint({ Set1: '', Set2: '' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { validateScore: true, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.scoreMatches).toBeUndefined();
    });
  });

  // ========================================================================
  // validateMCPMatch match completion
  // ========================================================================
  describe('validateMCPMatch match completion', () => {
    it('should warn when match is not complete', () => {
      const match = makeMCPMatch();
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.warnings.some((w) => w.includes('Match not complete'))).toBe(true);
    });
  });

  // ========================================================================
  // validateMCPMatch server determination
  // ========================================================================
  describe('validateMCPMatch server determination', () => {
    it('should set server to 0 when Svr is "1"', () => {
      const point = makeMCPPoint({ Svr: '1' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchUp.history?.points?.[0]?.server).toBe(0);
    });

    it('should set server to 1 when Svr is "2"', () => {
      const point = makeMCPPoint({ Svr: '2', PtWinner: '2' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchUp.history?.points?.[0]?.server).toBe(1);
    });
  });

  // ========================================================================
  // validateMCPMatch stats tracking
  // ========================================================================
  describe('validateMCPMatch stats tracking', () => {
    it('should count aces (serve with * terminator, no rally)', () => {
      const point = makeMCPPoint({ '1st': '4*', '2nd': '', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.aces).toBe(1);
    });

    it('should count double faults', () => {
      const point = makeMCPPoint({ '1st': '4n', '2nd': '5n', PtWinner: '2', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.doubleFaults).toBe(1);
    });

    it('should count winners (rally shot with * terminator)', () => {
      // 4 = serve wide, f1* = forehand direction 1 winner
      const point = makeMCPPoint({ '1st': '4f1*', '2nd': '', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.winners).toBe(1);
    });

    it('should count unforced errors (rally shot with @ terminator)', () => {
      // 4 = serve, b2w@ = backhand dir 2 wide unforced error
      const point = makeMCPPoint({ '1st': '4b2w@', '2nd': '', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.unforcedErrors).toBe(1);
    });

    it('should count forced errors (rally shot with # terminator)', () => {
      // 4 = serve, f1 = forehand hit, b2n# = backhand net forced error
      const point = makeMCPPoint({ '1st': '4f1b2n#', '2nd': '', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.forcedErrors).toBe(1);
    });
  });

  // ========================================================================
  // validateMCPMatch point decorations
  // ========================================================================
  describe('validateMCPMatch point decorations', () => {
    it('should add serve location to history points', () => {
      // 6 = T serve location
      const point = makeMCPPoint({ '1st': '6f1*', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.serveLocation).toBe('T');
    });

    it('should add stroke type to history points', () => {
      const point = makeMCPPoint({ '1st': '4b2*', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.stroke).toBeDefined();
    });

    it('should add rally data to history points', () => {
      const point = makeMCPPoint({ '1st': '4f1b2f3*', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.rally).toBeDefined();
      expect(historyPoint?.rallyLength).toBeGreaterThan(0);
    });

    it('should add code to history points', () => {
      const point = makeMCPPoint({ '1st': '4f1*', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.code).toBeDefined();
    });

    it('should add hand (forehand/backhand) to history points', () => {
      const point = makeMCPPoint({ '1st': '4b2*', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.hand).toBeDefined();
    });

    it('should handle points with empty serve codes', () => {
      const point = makeMCPPoint({ '1st': '', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.pointsProcessed).toBe(1);
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.result).toBe('Unknown');
    });

    it('should handle points with second serve data', () => {
      // First serve fault (4n), second serve in play (5f1*)
      const point = makeMCPPoint({ '1st': '4n', '2nd': '5f1*', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.pointsProcessed).toBe(1);
      const historyPoint = result.matchUp.history?.points?.[0];
      expect(historyPoint?.serve).toBe(2);
    });
  });

  // ========================================================================
  // mcpValidator main function branches
  // ========================================================================
  describe('mcpValidator main function', () => {
    it('should handle empty csvData', () => {
      const result = mcpValidator({ csvData: '' });
      expect(result.valid).toBe(false);
      expect(result.matchesProcessed).toBe(0);
      expect(result.errors.some((e) => e.includes('No matches found'))).toBe(true);
    });

    it('should handle CSV with only headers', () => {
      const csvData = 'match_id,Pt,Set1,Set2,Gm1,Gm2,Pts,Svr,Ret,1st,2nd,PtWinner';
      const result = mcpValidator({ csvData });
      expect(result.valid).toBe(false);
      expect(result.matchesProcessed).toBe(0);
    });

    it('should report "No matches found in CSV data" when no matches exist', () => {
      const result = mcpValidator({ csvData: 'header1\n' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No matches found in CSV data'))).toBe(true);
    });

    it('should report "Match ID not found" when matchId filter finds nothing', () => {
      const points = [makeMCPPoint()];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, matchId: 'nonexistent-id' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Match ID not found: nonexistent-id'))).toBe(true);
      expect(result.matchesProcessed).toBe(0);
    });

    it('should filter and process matching matchId', () => {
      const matchId = '20200101-M-TestTournament-F-Player_One-Player_Two';
      const points = [makeMCPPoint({ match_id: matchId })];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, matchId, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchesProcessed).toBe(1);
      expect(result.matchUps[0].matchUpId).toBe(matchId);
    });

    it('should process all matches when no matchId filter', () => {
      const match1Id = '20200101-M-Test-F-A-B';
      const match2Id = '20200102-M-Test-F-C-D';
      const points = [
        makeMCPPoint({ match_id: match1Id }),
        makeMCPPoint({ match_id: match2Id }),
      ];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.matchesProcessed).toBe(2);
    });

    it('should accumulate stats across multiple matches', () => {
      const match1Id = '20200101-M-Test-F-A-B';
      const match2Id = '20200102-M-Test-F-C-D';
      const points = [
        makeMCPPoint({ match_id: match1Id, '1st': '4*', '2nd': '', PtWinner: '1' }),
        makeMCPPoint({ match_id: match2Id, '1st': '4*', '2nd': '', PtWinner: '1' }),
      ];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.totalAces).toBe(2);
    });

    it('should accumulate errors from invalid matches', () => {
      const point = makeMCPPoint({ Set1: '6', Set2: '4' });
      const csvData = buildCSV([point]);

      // Will have score mismatch: expected "6-4" but only 1 point played
      const result = mcpValidator({ csvData, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.valid).toBe(false);
    });

    it('should accumulate warnings from matches', () => {
      const points = [makeMCPPoint()];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, matchUpFormat: 'SET3-S:6/TB7' });
      // Single point won't complete match => warning about not complete + default format warning
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should run with debug=true', () => {
      const points = [makeMCPPoint()];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, debug: true, matchUpFormat: 'SET3-S:6/TB7' });
      expect(result).toBeDefined();
      expect(result.matchesProcessed).toBe(1);
    });

    it('should pass matchUpFormat through to match validation', () => {
      const points = [makeMCPPoint()];
      const csvData = buildCSV(points);

      const result = mcpValidator({ csvData, matchUpFormat: 'SET1-S:6/TB7' });
      expect(result.matchesProcessed).toBe(1);
    });

    it('should return zero stats when CSV parsing fails', () => {
      // Non-string input cast to string to trigger parse failure path
      // parseCSV returns [] for non-string, which means no matches
      const result = mcpValidator({ csvData: 123 as unknown as string });
      expect(result.valid).toBe(false);
      expect(result.totalAces).toBe(0);
      expect(result.totalDoubleFaults).toBe(0);
      expect(result.totalWinners).toBe(0);
      expect(result.totalUnforcedErrors).toBe(0);
      expect(result.totalForcedErrors).toBe(0);
    });
  });

  // ========================================================================
  // exportMatchUpJSON
  // ========================================================================
  describe('catch block coverage - point errors with debug', () => {
    it('should catch errors when addPoint throws (invalid format)', () => {
      // addPoint throws for invalid matchUpFormat like 'INVALID'
      const match = makeMCPMatch({
        match_id: '20200101-M-Test-F-A-B',
        points: [makeMCPPoint()],
      });

      // Without debug - exercises the non-debug catch path
      const result = validateMCPMatch(match, { matchUpFormat: 'INVALID', debug: false });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Point 1:');
      expect(result.pointsProcessed).toBe(0);
    });

    it('should catch errors with debug enabled and log them', () => {
      const match = makeMCPMatch({
        match_id: '20200101-M-Test-F-A-B',
        points: [makeMCPPoint()],
      });

      // With debug - exercises the debug catch path (line 283-284)
      const result = validateMCPMatch(match, { matchUpFormat: 'INVALID', debug: true });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Point 1:');
      expect(result.pointsProcessed).toBe(0);
    });
  });

  describe('exportMatchUpJSON', () => {
    it('should export a matchUp with decorations to valid JSON', () => {
      const match = makeMCPMatch();
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const json = exportMatchUpJSON(result.matchUp);

      expect(json).toBeTruthy();
      const parsed = JSON.parse(json);
      expect(parsed.matchUpId).toBe(match.match_id);
      expect(parsed.sides).toHaveLength(2);
    });

    it('should export a matchUp from empty points', () => {
      const match: MCPMatch = { match_id: 'test', points: [] };
      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      const json = exportMatchUpJSON(result.matchUp);

      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================
  describe('edge cases', () => {
    it('should skip undefined entries in points array', () => {
      const match: MCPMatch = {
        match_id: '20200101-M-Test-F-A-B',
        points: [undefined as unknown as MCPPoint, makeMCPPoint()],
      };

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.pointsProcessed).toBe(1);
    });

    it('should handle ace on second serve', () => {
      const point = makeMCPPoint({ '1st': '4n', '2nd': '5*', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.aces).toBe(1);
    });

    it('should handle multiple points from different servers', () => {
      const points = [
        makeMCPPoint({ Svr: '1', PtWinner: '1', '1st': '4*', '2nd': '' }),
        makeMCPPoint({ Svr: '2', PtWinner: '2', '1st': '4*', '2nd': '' }),
      ];
      const match = makeMCPMatch({ points });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.aces).toBe(2);
      expect(result.pointsProcessed).toBe(2);
    });

    it('should handle returner winning point', () => {
      // Serve goes in, return winner
      const point = makeMCPPoint({ Svr: '1', PtWinner: '2', '1st': '4b2w@', '2nd': '' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.pointsProcessed).toBe(1);
      expect(result.unforcedErrors).toBe(1);
    });

    it('should handle serve winner (# terminator on serve with rally of 1)', () => {
      // 4 serve, f2n# = return that is forced error (serve winner scenario)
      const point = makeMCPPoint({ '1st': '4f2n#', '2nd': '', PtWinner: '1', Svr: '1' });
      const match = makeMCPMatch({ points: [point] });

      const result = validateMCPMatch(match, { matchUpFormat: 'SET3-S:6/TB7' });
      expect(result.pointsProcessed).toBe(1);
    });
  });
});
