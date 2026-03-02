import type { MCPPoint } from '@Validators/scoring/mcpParser';
import { describe, it, expect } from 'vitest';
import {
  shotSplitter,
  analyzeSequence,
  pointParser,
  shotParser,
  parseMCPPoint,
  parsePointWinner,
} from '@Validators/scoring/mcpParser';

describe('mcpParser - Shot Sequence Parsing', () => {
  describe('shotSplitter', () => {
    it('should split simple serve codes', () => {
      const result = shotSplitter('456');
      expect(result).toEqual(['4', '5', '6']);
    });

    it('should split shot sequence with terminators', () => {
      const result = shotSplitter('4f28f3*');
      expect(result).toEqual(['4', 'f28', 'f3*']);
    });

    it('should handle complex rally', () => {
      const result = shotSplitter('6b19f3b2b1n@');
      expect(result).toEqual(['6', 'b19', 'f3', 'b2', 'b1n@']);
    });

    it('should handle volleys and positions', () => {
      const result = shotSplitter('4s38b3b1*');
      expect(result).toEqual(['4', 's38', 'b3', 'b1*']);
    });
  });

  describe('analyzeSequence', () => {
    it('should identify ace', () => {
      const result = analyzeSequence('4*');
      expect(result.serves).toEqual(['4*']);
      expect(result.rally).toEqual([]);
      expect(result.terminator).toBe('*');
    });

    it('should identify serve with rally', () => {
      const result = analyzeSequence('4f28f3*');
      expect(result.serves).toEqual(['4']);
      expect(result.rally).toEqual(['f28', 'f3*']);
      expect(result.terminator).toBe('*');
    });

    it('should identify unforced error', () => {
      const result = analyzeSequence('6b19f3b2b1n@');
      expect(result.serves).toEqual(['6']);
      expect(result.rally).toEqual(['b19', 'f3', 'b2', 'b1n@']);
      expect(result.terminator).toBe('@');
    });

    it('should count lets', () => {
      const result = analyzeSequence('c4f3*');
      expect(result.lets).toBe(1);
      expect(result.serves).toEqual(['4']);
    });

    it('should handle double serve codes', () => {
      const result = analyzeSequence('456');
      expect(result.serves).toEqual(['4', '5', '6']);
      expect(result.rally).toEqual([]);
    });
  });

  describe('shotParser', () => {
    it('should parse ace on first serve', () => {
      const result = shotParser('4*', 1);
      expect(result.winner).toBe('S');
      expect(result.result).toBe('Ace');
      expect(result.serves).toEqual(['4*']);
    });

    it('should parse serve winner', () => {
      const result = shotParser('4f#', 1);
      expect(result.winner).toBe('S');
      expect(result.result).toBe('Serve Winner');
    });

    it('should parse winner from rally', () => {
      const result = shotParser('4f28f3*', 1);
      expect(result.winner).toBe('S');
      expect(result.result).toBe('Winner');
      expect(result.rally).toEqual(['f28', 'f3*']);
    });

    it('should parse unforced error', () => {
      const result = shotParser('6b19f3b2b1n@', 1);
      // 5 shots: 6(S), b19(R), f3(S), b2(R), b1n@(S)
      // Last player (S) made unforced error, so receiver (R) wins
      expect(result.winner).toBe('R');
      expect(result.result).toBe('Unforced Error');
      expect(result.error).toBe('Net');
    });

    it('should parse forced error', () => {
      const result = shotParser('4f28f#', 1);
      // 3 shots: 4(S), f28(R), f#(S)
      // Last player (S) made forced error, so receiver (R) wins
      expect(result.winner).toBe('R');
      expect(result.result).toBe('Forced Error');
    });

    it('should parse double fault', () => {
      const result = shotParser('5d', 2);
      expect(result.winner).toBe('R');
      expect(result.result).toBe('Double Fault');
      expect(result.error).toBe('Out Long');
    });

    it('should handle netted serve', () => {
      const result = shotParser('4n', 2);
      expect(result.winner).toBe('R');
      expect(result.result).toBe('Double Fault');
    });
  });

  describe('pointParser', () => {
    it('should parse ace on first serve', () => {
      const result = pointParser(['4*', '']);
      expect(result.winner).toBe('S');
      expect(result.result).toBe('Ace');
      expect(result.serve).toBe(1);
    });

    it('should parse point won on second serve', () => {
      const result = pointParser(['4n', '5f28f3*']);
      expect(result.winner).toBe('S');
      expect(result.serve).toBe(2);
      expect(result.first_serve).toBeDefined();
      expect(result.first_serve?.error).toBe('Net');
    });

    it('should parse double fault', () => {
      const result = pointParser(['4n', '5n']);
      expect(result.winner).toBe('R');
      expect(result.result).toBe('Double Fault');
      expect(result.serve).toBe(2);
    });

    it('should include code', () => {
      const result = pointParser(['4*', '']);
      expect(result.code).toBe('4*|');
    });
  });

  describe('parsePointWinner', () => {
    it('should return server index when server wins', () => {
      const point: MCPPoint = {
        match_id: 'test',
        Pt: '1',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '0-0',
        Svr: '1',
        Ret: '2',
        '1st': '4*',
        '2nd': '',
        PtWinner: '1',
        isAce: 'TRUE',
        isDouble: 'FALSE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'FALSE',
        rallyCount: '0',
      };

      expect(parsePointWinner(point, 0)).toBe(0);
    });

    it('should return receiver index when receiver wins', () => {
      const point: MCPPoint = {
        match_id: 'test',
        Pt: '1',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '0-0',
        Svr: '1',
        Ret: '2',
        '1st': '4n',
        '2nd': '5n',
        PtWinner: '2',
        isAce: 'FALSE',
        isDouble: 'TRUE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'FALSE',
        rallyCount: '0',
      };

      expect(parsePointWinner(point, 0)).toBe(1);
    });
  });

  describe('parseMCPPoint', () => {
    it('should parse ace with all decorations', () => {
      const mcpPoint: MCPPoint = {
        match_id: 'test-match',
        Pt: '1',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '0-0',
        Svr: '1',
        Ret: '2',
        '1st': '4*',
        '2nd': '',
        PtWinner: '1',
        isAce: 'TRUE',
        isDouble: 'FALSE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'FALSE',
        rallyCount: '0',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.winner).toBe(0);
      expect(result.server).toBe(0);
      expect(result.result).toBe('Ace');
      expect(result.serve).toBe(1);
      expect(result.serveLocation).toBe('Wide');
      expect(result.code).toBe('4*|');
    });

    it('should parse rally winner with stroke details', () => {
      const mcpPoint: MCPPoint = {
        match_id: 'test-match',
        Pt: '2',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '15-0',
        Svr: '1',
        Ret: '2',
        '1st': '6b28f3*',
        '2nd': '',
        PtWinner: '1',
        isAce: 'FALSE',
        isDouble: 'FALSE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'TRUE',
        rallyCount: '2',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.winner).toBe(0);
      expect(result.server).toBe(0);
      expect(result.result).toBe('Winner');
      expect(result.serve).toBe(1);
      expect(result.serveLocation).toBe('T');
      expect(result.stroke).toBe('Forehand');
      expect(result.hand).toBe('Forehand');
      expect(result.rally).toBeDefined();
      expect(result.rally!.length).toBeGreaterThan(0);
    });

    it('should parse double fault', () => {
      const mcpPoint: MCPPoint = {
        match_id: 'test-match',
        Pt: '3',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '15-15',
        Svr: '1',
        Ret: '2',
        '1st': '4n',
        '2nd': '5n',
        PtWinner: '2',
        isAce: 'FALSE',
        isDouble: 'TRUE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'FALSE',
        rallyCount: '0',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.winner).toBe(1);
      expect(result.server).toBe(0);
      expect(result.result).toBe('Double Fault');
      expect(result.serve).toBe(2);
      expect(result.serveLocation).toBe('Body');
    });

    it('should parse backhand error', () => {
      const mcpPoint: MCPPoint = {
        match_id: 'test-match',
        Pt: '4',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '30-15',
        Svr: '1',
        Ret: '2',
        '1st': '6b28b3w@',
        '2nd': '',
        PtWinner: '1',
        isAce: 'FALSE',
        isDouble: 'FALSE',
        isUnforced: 'TRUE',
        isForced: 'FALSE',
        isRallyWinner: 'FALSE',
        rallyCount: '2',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.winner).toBe(0);
      expect(result.result).toBe('Unforced Error');
      expect(result.stroke).toBe('Backhand');
      expect(result.hand).toBe('Backhand');
    });

    it('should build rally sequence with positions', () => {
      const mcpPoint: MCPPoint = {
        match_id: 'test-match',
        Pt: '5',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '40-15',
        Svr: '1',
        Ret: '2',
        '1st': '4f28b3f1*',
        '2nd': '',
        PtWinner: '1',
        isAce: 'FALSE',
        isDouble: 'FALSE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'TRUE',
        rallyCount: '3',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.rally).toBeDefined();
      expect(result.rally!.length).toBe(4); // serve + 3 rally shots
      expect(result.rally![0].player).toBe(0); // server
      expect(result.rally![1].player).toBe(1); // receiver
      expect(result.rally![2].player).toBe(0); // server
      expect(result.rally![3].player).toBe(1); // receiver

      // Check stroke types
      expect(result.rally![0].stroke).toBeDefined();
      expect(result.rally![1].stroke).toBe('Forehand');
      expect(result.rally![2].stroke).toBe('Backhand');
      expect(result.rally![3].stroke).toBe('Forehand');

      // Check depths
      expect(result.rally![1].depth).toBe('deep');
      expect(result.rally![2].direction).toBe(3);
      expect(result.rally![3].direction).toBe(1);
    });
  });

  describe('Real MCP Examples', () => {
    it('should parse Federer-Djokovic point 1', () => {
      // First point from example.csv
      const mcpPoint: MCPPoint = {
        match_id: '20151122-M-Tour_Finals-F-Roger_Federer-Novak_Djokovic',
        Pt: '1',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '0-0',
        Svr: '1',
        Ret: '2',
        '1st': '4n',
        '2nd': '6b19f3b2b1n@',
        PtWinner: '2',
        isAce: 'FALSE',
        isDouble: 'FALSE',
        isUnforced: 'TRUE',
        isForced: 'FALSE',
        isRallyWinner: 'FALSE',
        rallyCount: '4',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.winner).toBe(1); // Receiver wins
      expect(result.server).toBe(0);
      expect(result.serve).toBe(2); // Second serve
      expect(result.serveLocation).toBe('T');
      expect(result.result).toBe('Unforced Error');
      expect(result.stroke).toBe('Backhand');
      expect(result.hand).toBe('Backhand');
      expect(result.rally).toBeDefined();
      expect(result.rallyLength).toBeGreaterThan(0);
    });

    it('should parse point with approach shot', () => {
      const mcpPoint: MCPPoint = {
        match_id: 'test',
        Pt: '1',
        Set1: '0',
        Set2: '0',
        Gm1: '0',
        Gm2: '0',
        Pts: '0-0',
        Svr: '1',
        Ret: '2',
        '1st': '4f28f+3b3z1*',
        '2nd': '',
        PtWinner: '2',
        isAce: 'FALSE',
        isDouble: 'FALSE',
        isUnforced: 'FALSE',
        isForced: 'FALSE',
        isRallyWinner: 'TRUE',
        rallyCount: '4',
      };

      const result = parseMCPPoint(mcpPoint, 0);

      expect(result.winner).toBe(1);
      expect(result.result).toBe('Winner');
      expect(result.rally).toBeDefined();

      // Check for approach shot position
      const approachShot = result.rally!.find((s) => s.position === 'approach');
      expect(approachShot).toBeDefined();
    });
  });
});
