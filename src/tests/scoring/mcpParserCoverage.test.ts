/**
 * mcpParser - Coverage improvement tests
 *
 * Targets uncovered branches in:
 * - analyzeSequence: non-string input, simple result codes (S/P/Q/R)
 * - shotParser: edge cases with no terminator, serve faults, rally faults
 * - pointParser: first serve wins, first_serve metadata propagation
 * - buildRallySequence: faulted serve, depth/direction/position extraction
 * - parseMCPPoint: empty serves, backhand strokes, second serve location
 * - parseCSV: invalid input, single-line, empty lines
 * - groupByMatch: non-array input, multiple matches
 */

import type { MCPPoint } from '@Validators/scoring/mcpParser';
import { describe, it, expect } from 'vitest';
import {
  shotSplitter,
  analyzeSequence,
  pointParser,
  shotParser,
  parseMCPPoint,
  parsePointWinner,
  parseCSV,
  groupByMatch,
} from '@Validators/scoring/mcpParser';

function makeMCPPoint(overrides: Partial<MCPPoint> = {}): MCPPoint {
  return {
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
    isAce: 'FALSE',
    isDouble: 'FALSE',
    isUnforced: 'FALSE',
    isForced: 'FALSE',
    isRallyWinner: 'FALSE',
    rallyCount: '0',
    ...overrides,
  };
}

describe('mcpParser - Coverage Improvements', () => {
  // ==========================================================================
  // analyzeSequence edge cases
  // ==========================================================================
  describe('analyzeSequence edge cases', () => {
    it('should return empty serves/rally for non-string input', () => {
      const result = analyzeSequence(undefined as unknown as string);
      expect(result.serves).toEqual([]);
      expect(result.rally).toEqual([]);
    });

    it('should return empty serves/rally for numeric input', () => {
      const result = analyzeSequence(42 as unknown as string);
      expect(result.serves).toEqual([]);
      expect(result.rally).toEqual([]);
    });

    it('should parse simple result code S (server wins)', () => {
      const result = analyzeSequence('S');
      expect(result.result).toBe('S');
      expect(result.rally).toHaveLength(0);
    });

    it('should parse simple result code P (penalty on server)', () => {
      const result = analyzeSequence('P');
      expect(result.result).toBe('P');
      expect(result.rally).toHaveLength(0);
    });

    it('should parse simple result code Q (server wins via code)', () => {
      const result = analyzeSequence('Q');
      expect(result.result).toBe('Q');
      expect(result.rally).toHaveLength(0);
    });

    it('should parse simple result code R (receiver wins via code)', () => {
      const result = analyzeSequence('R');
      expect(result.result).toBe('R');
      expect(result.rally).toHaveLength(0);
    });

    it('should handle multiple lets', () => {
      const result = analyzeSequence('cc4f1*');
      expect(result.lets).toBe(2);
      expect(result.serves).toEqual(['4']);
      expect(result.terminator).toBe('*');
    });

    it('should handle empty string', () => {
      const result = analyzeSequence('');
      expect(result.serves).toEqual([]);
      expect(result.rally).toEqual([]);
    });
  });

  // ==========================================================================
  // shotParser edge cases
  // ==========================================================================
  describe('shotParser edge cases', () => {
    it('should handle result code Q (server wins)', () => {
      const result = shotParser('Q', 1);
      expect(result.winner).toBe('S');
    });

    it('should handle result code S (server wins)', () => {
      const result = shotParser('S', 1);
      expect(result.winner).toBe('S');
    });

    it('should handle result code P (receiver wins)', () => {
      const result = shotParser('P', 1);
      expect(result.winner).toBe('R');
    });

    it('should handle result code R (receiver wins)', () => {
      const result = shotParser('R', 1);
      expect(result.winner).toBe('R');
    });

    it('should handle no terminator with >2 serves and no serve fault (receiver wins)', () => {
      // 3 serves without fault or terminator: receiver wins
      const result = shotParser('456', 1);
      expect(result.winner).toBe('R');
    });

    it('should return undefined winner when no final shot exists', () => {
      // analyzeSequence('') returns empty serves and rally
      const result = shotParser('', 1);
      expect(result.winner).toBeUndefined();
    });

    it('should parse serve with # terminator as Serve Winner (no rally)', () => {
      const result = shotParser('4#', 1);
      expect(result.winner).toBe('S');
      expect(result.result).toBe('Serve Winner');
    });

    it('should detect fault on first serve as first serve fault (whichServe=1)', () => {
      // First serve fault, whichServe=1 - no double fault
      const result = shotParser('4n', 1);
      expect(result.error).toBe('Net');
      expect(result.result).toBeUndefined(); // Not a double fault on first serve
      expect(result.winner).toBeUndefined();
    });

    it('should treat serve without fault or terminator as fault on first serve', () => {
      // No recognized fault code but no terminator either - treated as fault
      const result = shotParser('4', 1);
      expect(result.parse_notes).toBe('treated as a fault');
      expect(result.winner).toBeUndefined(); // First serve, not double fault
    });

    it('should treat serve without fault or terminator as double fault on second serve', () => {
      const result = shotParser('4', 2);
      expect(result.parse_notes).toBe('treated as a fault');
      expect(result.result).toBe('Double Fault');
      expect(result.winner).toBe('R');
    });

    it('should handle serve fault with double fault on second serve', () => {
      const result = shotParser('5d', 2);
      expect(result.error).toBe('Out Long');
      expect(result.result).toBe('Double Fault');
      expect(result.winner).toBe('R');
    });

    it('should parse forced error with # in rally (>1 rally shots)', () => {
      // 4(serve), f1(rally 1), b2n#(rally 2 - forced error)
      const result = shotParser('4f1b2n#', 1);
      expect(result.result).toBe('Forced Error');
      expect(result.error).toBe('Net');
      // Last player hit b2n# (even index from serve count), error means opposite wins
    });

    it('should parse unforced error with @ in rally', () => {
      const result = shotParser('4f1b2w@', 1);
      expect(result.result).toBe('Unforced Error');
      expect(result.error).toBe('Out Wide');
    });

    it('should handle no terminator with serve and rally (receiver wins unknown)', () => {
      // Serve + rally shots but no terminator and no serve fault
      const result = shotParser('4f1b2', 1);
      expect(result.parse_notes).toBe('no terminator: receiver wins point');
      expect(result.result).toBe('Unknown');
      expect(result.winner).toBe('R');
    });

    it('should handle rally of 1 with fault but no serve fault (no terminator)', () => {
      // This hits the branch: rally.length === 1 && shotFault(finalShot) with no serve fault
      // Need: no terminator, no serve fault, serves.length > 0, rally.length === 1, finalShot has fault
      // We need a valid serve followed by a single rally shot with a fault code
      // shotFault checks for n/w/d/x/g/e/!
      // But we need !parsedShots.terminator and shotFault(serves[0]) to be falsy
      // Actually the branch at line 424-432 is:
      // } else if (!shotFault(parsedShots.serves[0])) {
      //   if (serves.length && rally.length) { ... } else if (rally.length === 1 && shotFault(finalShot)) { ... }
      // The rally.length === 1 && shotFault sub-branch requires serves.length === 0
      // Let's try without serves
      const result = shotParser('f1w', 1);
      // No serves, rally = ['f1w'], no terminator
      // shotFault('f1w') finds 'w' -> 'Out Wide'
      expect(result.error).toBe('Out Wide');
    });

    it('should handle serve fault + rally of 1 with fault code', () => {
      // Branch at line 433-436: else if (rally.length === 1 && shotFault(finalShot))
      // This requires: serves[0] has fault, rally.length === 1, finalShot has fault
      const result = shotParser('4nf1w', 1);
      // serves = ['4n'], rally = ['f1w']
      // shotFault('4n') = 'n', so we go to the else branch (line 433)
      // rally.length === 1, shotFault('f1w') = 'w'
      expect(result.error).toBe('Out Wide');
    });

    it('should handle serve winner with error code in rally shot', () => {
      // Rally of 1 with # (serve winner): line 402-408
      // Need serve + exactly 1 rally shot with # and an error code
      const result = shotParser('4f2w#', 1);
      expect(result.result).toBe('Serve Winner');
      expect(result.winner).toBe('S');
      expect(result.error).toBe('Out Wide');
    });

    it('should handle various error codes in faults', () => {
      // Test different ERRORS mappings
      const resultX = shotParser('4x', 2);
      expect(resultX.error).toBe('Out Wide and Long');

      const resultG = shotParser('4g', 2);
      expect(resultG.error).toBe('Foot Fault');

      const resultE = shotParser('4e', 2);
      expect(resultE.error).toBe('Unknown');

      const resultShank = shotParser('4!', 2);
      expect(resultShank.error).toBe('Shank');
    });
  });

  // ==========================================================================
  // pointParser edge cases
  // ==========================================================================
  describe('pointParser edge cases', () => {
    it('should return first serve result when first serve wins', () => {
      const result = pointParser(['4*', '5f1*']);
      expect(result.serve).toBe(1);
      expect(result.winner).toBe('S');
      expect(result.result).toBe('Ace');
      // second serve should not be parsed
    });

    it('should propagate first_serve lets to second serve result', () => {
      const result = pointParser(['c4n', '5f1*']);
      expect(result.serve).toBe(2);
      expect(result.first_serve).toBeDefined();
      expect(result.first_serve?.lets).toBe(1);
    });

    it('should propagate first_serve parse_notes to second serve result', () => {
      // First serve treated as fault (no error code, no terminator)
      const result = pointParser(['4', '5*']);
      expect(result.serve).toBe(2);
      expect(result.first_serve?.parse_notes).toBe('treated as a fault');
    });

    it('should handle first serve with empty second serve', () => {
      const result = pointParser(['4f1*', '']);
      expect(result.serve).toBe(1);
      expect(result.code).toBe('4f1*|');
    });

    it('should handle first serve fault without second serve data', () => {
      // s1result.winner is not 'S', and serves[1] is empty/falsy
      const result = pointParser(['4n', '']);
      expect(result.serve).toBe(1);
      // First serve fault with no second serve - returns first serve result
    });
  });

  // ==========================================================================
  // parseMCPPoint edge cases
  // ==========================================================================
  describe('parseMCPPoint edge cases', () => {
    it('should return Unknown result when both serve codes are empty', () => {
      const point = makeMCPPoint({ '1st': '', '2nd': '' });
      const result = parseMCPPoint(point, 0);
      expect(result.result).toBe('Unknown');
      expect(result.winner).toBeDefined();
      expect(result.server).toBe(0);
    });

    it('should extract serve location from second serve when serve=2', () => {
      const point = makeMCPPoint({ '1st': '4n', '2nd': '6f1*', Svr: '1', PtWinner: '1' });
      const result = parseMCPPoint(point, 0);
      expect(result.serve).toBe(2);
      expect(result.serveLocation).toBe('T'); // 6 = T location from second serve
    });

    it('should detect backhand hand from stroke', () => {
      const point = makeMCPPoint({ '1st': '4b2*', '2nd': '', PtWinner: '1', Svr: '1' });
      const result = parseMCPPoint(point, 0);
      expect(result.stroke).toBe('Backhand');
      expect(result.hand).toBe('Backhand');
    });

    it('should handle trick shot stroke (no hand classification)', () => {
      const point = makeMCPPoint({ '1st': '4t1*', '2nd': '', PtWinner: '1', Svr: '1' });
      const result = parseMCPPoint(point, 0);
      expect(result.stroke).toBe('Trick Shot');
      expect(result.hand).toBeUndefined();
    });

    it('should handle unknown shot stroke (no hand classification)', () => {
      const point = makeMCPPoint({ '1st': '4q1*', '2nd': '', PtWinner: '1', Svr: '1' });
      const result = parseMCPPoint(point, 0);
      expect(result.stroke).toBe('Unknown Shot');
      expect(result.hand).toBeUndefined();
    });

    it('should build rally sequence with depth annotations', () => {
      // 7=shallow, 8=deep, 9=very deep
      const point = makeMCPPoint({ '1st': '4f17b28f39*', '2nd': '', PtWinner: '1', Svr: '1' });
      const result = parseMCPPoint(point, 0);
      expect(result.rally).toBeDefined();
      const shots = result.rally!;
      // Find shots with depth annotations
      const shallowShot = shots.find((s) => s.depth === 'shallow');
      const deepShot = shots.find((s) => s.depth === 'deep');
      const veryDeepShot = shots.find((s) => s.depth === 'very deep');
      expect(shallowShot).toBeDefined();
      expect(deepShot).toBeDefined();
      expect(veryDeepShot).toBeDefined();
    });

    it('should build rally sequence with position annotations', () => {
      // + = approach, - = net, = = baseline
      const point = makeMCPPoint({ '1st': '4f+1b-2f=3*', '2nd': '', PtWinner: '1', Svr: '1' });
      const result = parseMCPPoint(point, 0);
      expect(result.rally).toBeDefined();
      const shots = result.rally!;
      const approachShot = shots.find((s) => s.position === 'approach');
      const netShot = shots.find((s) => s.position === 'net');
      const baselineShot = shots.find((s) => s.position === 'baseline');
      expect(approachShot).toBeDefined();
      expect(netShot).toBeDefined();
      expect(baselineShot).toBeDefined();
    });

    it('should handle server index 1', () => {
      const point = makeMCPPoint({ Svr: '2', PtWinner: '2', '1st': '4*', '2nd': '' });
      const result = parseMCPPoint(point, 1);
      expect(result.server).toBe(1);
      expect(result.winner).toBe(1); // PtWinner=2 matches Svr=2, so winner = serverIndex = 1
    });

    it('should handle all backhand stroke variants', () => {
      // s=Backhand Slice, z=Backhand Volley, p=Backhand Overhead Smash,
      // y=Backhand Drop Shot, m=Backhand Lob, i=Backhand Half-volley, k=Backhand Drive Volley
      const strokes = [
        { code: 's', expected: 'Backhand Slice' },
        { code: 'z', expected: 'Backhand Volley' },
        { code: 'p', expected: 'Backhand Overhead Smash' },
        { code: 'y', expected: 'Backhand Drop Shot' },
        { code: 'm', expected: 'Backhand Lob' },
        { code: 'i', expected: 'Backhand Half-volley' },
        { code: 'k', expected: 'Backhand Drive Volley' },
      ];

      for (const { code, expected } of strokes) {
        const point = makeMCPPoint({ '1st': `4${code}1*`, '2nd': '', PtWinner: '1', Svr: '1' });
        const result = parseMCPPoint(point, 0);
        expect(result.stroke).toBe(expected);
        expect(result.hand).toBe('Backhand');
      }
    });

    it('should handle all forehand stroke variants', () => {
      const strokes = [
        { code: 'r', expected: 'Forehand Slice' },
        { code: 'v', expected: 'Forehand Volley' },
        { code: 'o', expected: 'Overhead Smash' },
        { code: 'u', expected: 'Forehand Drop Shot' },
        { code: 'l', expected: 'Forehand Lob' },
        { code: 'h', expected: 'Forehand Half-volley' },
        { code: 'j', expected: 'Forehand Drive Volley' },
      ];

      for (const { code, expected } of strokes) {
        const point = makeMCPPoint({ '1st': `4${code}1*`, '2nd': '', PtWinner: '1', Svr: '1' });
        const result = parseMCPPoint(point, 0);
        expect(result.stroke).toBe(expected);
        expect(result.hand).toBe('Forehand');
      }
    });

    it('should not include rally when buildRallySequence returns empty', () => {
      // A faulted serve with no rally: buildRallySequence checks if last serve has fault
      const point = makeMCPPoint({ '1st': '4n', '2nd': '5n', PtWinner: '2', Svr: '1' });
      const result = parseMCPPoint(point, 0);
      // Double fault - rally sequence should be empty (faulted serve skipped, no rally shots)
      // But the serve code 5n has fault 'n', so buildRallySequence skips adding the serve
      // and there are no rally shots, so sequence is empty
      expect(result.result).toBe('Double Fault');
    });
  });

  // ==========================================================================
  // parseCSV edge cases
  // ==========================================================================
  describe('parseCSV edge cases', () => {
    it('should return empty array for non-string input', () => {
      expect(parseCSV(undefined as unknown as string)).toEqual([]);
      expect(parseCSV(null as unknown as string)).toEqual([]);
      expect(parseCSV(123 as unknown as string)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseCSV('')).toEqual([]);
    });

    it('should return empty array for single header line (no data)', () => {
      expect(parseCSV('match_id,Pt,Set1')).toEqual([]);
    });

    it('should parse valid CSV with data rows', () => {
      const csv = 'match_id,Pt,Set1\ntest,1,0\ntest,2,1';
      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
      expect(result[0].match_id).toBe('test');
      expect(result[0].Pt).toBe('1');
      expect(result[1].Set1).toBe('1');
    });

    it('should handle missing values in CSV rows', () => {
      const csv = 'match_id,Pt,Set1\ntest,,';
      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
      expect(result[0].Pt).toBe('');
      expect(result[0].Set1).toBe('');
    });

    it('should skip empty lines in CSV', () => {
      const csv = 'match_id,Pt\ntest,1\n\ntest,2';
      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
    });
  });

  // ==========================================================================
  // groupByMatch edge cases
  // ==========================================================================
  describe('groupByMatch edge cases', () => {
    it('should return empty array for non-array input', () => {
      expect(groupByMatch(undefined as unknown as MCPPoint[])).toEqual([]);
      expect(groupByMatch(null as unknown as MCPPoint[])).toEqual([]);
      expect(groupByMatch('string' as unknown as MCPPoint[])).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(groupByMatch([])).toEqual([]);
    });

    it('should group points by match_id', () => {
      const points = [
        makeMCPPoint({ match_id: 'match1', Pt: '1' }),
        makeMCPPoint({ match_id: 'match1', Pt: '2' }),
        makeMCPPoint({ match_id: 'match2', Pt: '1' }),
      ];
      const result = groupByMatch(points);
      expect(result).toHaveLength(2);
      expect(result[0].match_id).toBe('match1');
      expect(result[0].points).toHaveLength(2);
      expect(result[1].match_id).toBe('match2');
      expect(result[1].points).toHaveLength(1);
    });
  });

  // ==========================================================================
  // shotSplitter edge cases
  // ==========================================================================
  describe('shotSplitter edge cases', () => {
    it('should handle empty string', () => {
      expect(shotSplitter('')).toEqual([]);
    });

    it('should handle only modifiers (no stroke/serve start)', () => {
      // Modifiers without leading stroke code go into a single shot
      const result = shotSplitter('123');
      // 1,2,3 are not stroke or serve codes, so they accumulate
      expect(result).toEqual(['123']);
    });

    it('should handle all serve codes', () => {
      const result = shotSplitter('4n5n6n');
      expect(result).toEqual(['4n', '5n', '6n']);
    });
  });

  // ==========================================================================
  // parsePointWinner edge cases
  // ==========================================================================
  describe('parsePointWinner edge cases', () => {
    it('should return receiver index when PtWinner differs from Svr', () => {
      const point = makeMCPPoint({ Svr: '1', PtWinner: '2' });
      expect(parsePointWinner(point, 0)).toBe(1);
    });

    it('should handle serverIndex=1', () => {
      const point = makeMCPPoint({ Svr: '2', PtWinner: '2' });
      expect(parsePointWinner(point, 1)).toBe(1); // Winner matches server
    });

    it('should handle serverIndex=1 with receiver winning', () => {
      const point = makeMCPPoint({ Svr: '2', PtWinner: '1' });
      expect(parsePointWinner(point, 1)).toBe(0); // Winner is receiver (1-1=0)
    });
  });
});
