/**
 * The MCP validator reads a match's real score from the chart's own columns.
 *
 * MCP's `Set1`/`Set2` are sets WON, not set scores; games live in `Gm1`/`Gm2` and have to be read
 * at each set's end. The full export names those columns twice (before- and after-point), so
 * parseCSV must keep both copies. Together these decide whether the score check runs at all, and
 * whether a best-of-five replays as a best-of-five.
 */

import { chartToCSV, generateChart, MCP_POINTS_HEADER, parseSetScores } from '@Tests/helpers/mcpChart';
import { extractFinalScore, mcpValidator, validateMCPMatch } from '@Validators/scoring/mcpValidator';
import { groupByMatch, parseCSV } from '@Validators/scoring/mcpParser';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs-extra';
import { resolve } from 'path';

import type { MCPPoint } from '@Validators/scoring/mcpParser';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

const fixturePath = resolve(__dirname, 'fixtures/mcp-data/testing.csv');
const fixtureCSV = readFileSync(fixturePath, 'utf-8');
const MATCH_ID = '20200101-M-Test_Open-F-Player_One-Player_Two';

function fixtureMatch(csv = fixtureCSV) {
  const matches = groupByMatch(parseCSV(csv));
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('parseCSV keeps every copy of a repeated header', () => {
  it('suffixes the second occurrence with its ordinal and leaves the first under the bare name', () => {
    const points = parseCSV('a,b,a,c,a\n1,2,3,4,5');
    expect(points).toEqual([{ a: '1', b: '2', a_2: '3', c: '4', a_3: '5' }]);
  });

  it('reads the before-point and after-point copies of the fixture separately', () => {
    const points = parseCSV(fixtureCSV);
    // Row 80 is the last point of the first-set tiebreak: 6-6 before, 7-6 and a set won after
    const point = points[79];
    expect(point.Pt).toBe('80');
    expect([point.Gm1, point.Gm2, point.Set1, point.Set2]).toEqual(['6', '6', '0', '0']);
    expect([point.Gm1_2, point.Gm2_2, point.Set1_2, point.Set2_2]).toEqual(['7', '6', '1', '0']);
    // MCP's closing row carries the before-point state and nothing after it
    const closing = points.at(-1)!;
    expect([closing.Set1, closing.Set2, closing.PtWinner, closing.Set1_2]).toEqual(['2', '1', '', '']);
  });
});

describe('parseCSV tolerates RFC 4180 quoting', () => {
  it('keeps the columns after a quoted field that contains a comma', () => {
    const header = 'match_id,Pt,Notes,PtWinner';
    const points = parseCSV(`${header}\nm1,1,"Let on 4, replayed",2\nm1,2,"He said ""out""",1`);
    expect(points).toEqual([
      { match_id: 'm1', Pt: '1', Notes: 'Let on 4, replayed', PtWinner: '2' },
      { match_id: 'm1', Pt: '2', Notes: 'He said "out"', PtWinner: '1' },
    ]);
  });

  it('drops the carriage return of CRLF line endings', () => {
    const points = parseCSV('match_id,Pt,PtWinner\r\nm1,1,2\r\nm1,2,1\r\n');
    expect(points).toEqual([
      { match_id: 'm1', Pt: '1', PtWinner: '2' },
      { match_id: 'm1', Pt: '2', PtWinner: '1' },
    ]);
  });
});

describe('extractFinalScore reads the real score of the fixture', () => {
  it('is 7-6(0) 4-6 6-1 over three sets, a complete best-of-three', () => {
    expect(extractFinalScore(fixtureMatch().points)).toEqual({
      scoreString: '7-6(0), 4-6, 6-1',
      setsWon: [2, 1],
      bestOf: 3,
      complete: true,
    });
  });

  it('reads the same score when the closing row is absent (the after-point copy decides the last set)', () => {
    const points = fixtureMatch().points.slice(0, -1);
    expect(points.at(-1)?.Pt).toBe('176');
    expect(extractFinalScore(points)?.scoreString).toBe('7-6(0), 4-6, 6-1');
  });

  it('reports the set in progress when the chart stops mid-set', () => {
    // Row 175: 5-1 in the third, 0-30 with player 2 serving, player 1 wins the point: the game goes on
    const points = fixtureMatch().points.slice(0, 175);
    expect(points.at(-1)?.Pt).toBe('175');
    expect(extractFinalScore(points)).toEqual({
      scoreString: '7-6(0), 4-6, 5-1',
      setsWon: [1, 1],
      bestOf: 3,
      complete: false,
    });
  });

  it('is undefined without sets and games columns, or without a point', () => {
    const [point] = fixtureMatch().points;
    expect(extractFinalScore([])).toBeUndefined();
    expect(extractFinalScore([{ ...point, Set1: '' }])).toBeUndefined();
    expect(extractFinalScore([{ ...point, Gm2: 'x' }])).toBeUndefined();
    expect(extractFinalScore([{ ...point, PtWinner: '' }])).toBeUndefined();
    expect(extractFinalScore([point])).toBeUndefined();
  });
});

describe('validateMCPMatch checks the replay against the real score', () => {
  it('deduces a best-of-three and finds the fixture replay matches 7-6(0) 4-6 6-1', () => {
    const result = validateMCPMatch(fixtureMatch());
    expect(result.valid).toBe(true);
    expect(result.formatDeduced).toBe(true);
    expect(result.matchUp.matchUpFormat).toBe('SET3-S:6/TB7');
    expect(result.expectedScore).toBe('7-6(0), 4-6, 6-1');
    expect(result.actualScore).toBe('7-6(0), 4-6, 6-1');
    expect(result.scoreMatches).toBe(true);
    expect(result.matchUp.matchUpStatus).toBe(COMPLETED);
    expect(result.warnings).toEqual([]);
  });

  it('catches a replay whose points do not produce the charted score', () => {
    // Hand the first point of the second set (row 81) to the other player; the columns are untouched
    const match = fixtureMatch();
    const row = match.points.find((point) => point.Pt === '81')!;
    expect(row.PtWinner).toBe('1');
    row.PtWinner = '2';

    const result = validateMCPMatch(match);
    expect(result.expectedScore).toBe('7-6(0), 4-6, 6-1');
    expect(result.actualScore).not.toBe('7-6(0), 4-6, 6-1');
    expect(result.scoreMatches).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith('Score mismatch'))).toBe(true);
  });

  it('a wrong replay is also caught through mcpValidator on the whole file', () => {
    const lines = fixtureCSV.split('\n');
    const index = lines.findIndex((line) => line.split(',')[1] === '81');
    const fields = lines[index].split(',');
    expect(fields[40]).toBe('1'); // PtWinner
    fields[40] = '2';
    lines[index] = fields.join(',');
    const csv = lines.join('\n');
    const result = mcpValidator({ csvData: csv });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith('Score mismatch'))).toBe(true);
  });
});

describe("best-of-five charts in MCP's published header", () => {
  const score = '6-4 3-6 7-6(3) 2-6 6-3';

  it('the generated chart describes its score', () => {
    expect(parseSetScores(score)).toEqual([
      { games: [6, 4] },
      { games: [3, 6] },
      { games: [7, 6], tiebreak: [7, 3] },
      { games: [2, 6] },
      { games: [6, 3] },
    ]);
    expect(() => parseSetScores('6-4 abc')).toThrow('Unparseable set score: abc');
    expect(parseSetScores('6-7(5)')).toEqual([{ games: [6, 7], tiebreak: [5, 7] }]);

    const points = generateChart(MATCH_ID, score);
    expect(extractFinalScore(points)).toEqual({
      scoreString: '6-4, 3-6, 7-6(3), 2-6, 6-3',
      setsWon: [3, 2],
      bestOf: 5,
      complete: true,
    });
    const csv = chartToCSV(points);
    expect(csv.split('\n')[0]).toBe(MCP_POINTS_HEADER);
    expect(parseCSV(csv)).toHaveLength(points.length);
  });

  it('deduces SET5 and replays to the charted score', () => {
    const csv = chartToCSV(generateChart(MATCH_ID, score));
    const result = mcpValidator({ csvData: csv });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.matchesProcessed).toBe(1);
    expect(result.matchUps[0].matchUpFormat).toBe('SET5-S:6/TB7');
    expect(result.matchUps[0].matchUpStatus).toBe(COMPLETED);

    const [match] = groupByMatch(parseCSV(csv));
    const single = validateMCPMatch(match);
    expect(single.expectedScore).toBe('6-4, 3-6, 7-6(3), 2-6, 6-3');
    expect(single.actualScore).toBe('6-4, 3-6, 7-6(3), 2-6, 6-3');
    expect(single.scoreMatches).toBe(true);
  });

  it('three straight sets are a best-of-five; three sets with two won are a best-of-three', () => {
    const straight = validateMCPMatch({ match_id: MATCH_ID, points: generateChart(MATCH_ID, '6-4 6-4 6-4') });
    expect(straight.matchUp.matchUpFormat).toBe('SET5-S:6/TB7');
    expect(straight.scoreMatches).toBe(true);

    const decider = validateMCPMatch({ match_id: MATCH_ID, points: generateChart(MATCH_ID, '6-4 4-6 6-4') });
    expect(decider.matchUp.matchUpFormat).toBe('SET3-S:6/TB7');
    expect(decider.expectedScore).toBe('6-4, 4-6, 6-4');
    expect(decider.scoreMatches).toBe(true);
    expect(decider.matchUp.matchUpStatus).toBe(COMPLETED);
  });

  it('an advantage deciding set is deduced from the score', () => {
    const result = validateMCPMatch({ match_id: MATCH_ID, points: generateChart(MATCH_ID, '6-4 4-6 8-6') });
    expect(result.matchUp.matchUpFormat).toBe('SET3-S:6/TB7-F:6');
    expect(result.scoreMatches).toBe(true);
    expect(result.matchUp.matchUpStatus).toBe(COMPLETED);
  });

  it('a wrong replay of a best-of-five is caught', () => {
    const points = generateChart(MATCH_ID, score);
    // Hand the second set's first point to the other player; the columns are untouched
    const firstOfSecondSet = points.find((point) => point.Set1 === '1' && point.Set2 === '0')!;
    expect(firstOfSecondSet.PtWinner).toBe('1');
    firstOfSecondSet.PtWinner = '2';
    const result = validateMCPMatch({ match_id: MATCH_ID, points });
    expect(result.expectedScore).toBe('6-4, 3-6, 7-6(3), 2-6, 6-3');
    expect(result.scoreMatches).toBe(false);
    expect(result.valid).toBe(false);
  });
});

describe('a chart cut short', () => {
  it('after a game ends mid-set reports the games so far and a best-of-five in progress', () => {
    // 6-4 is built L W L W L W L W W W: dropping the last five games leaves L W L W L, 2-3
    const points = generateChart(MATCH_ID, '6-4 6-4 6-4').slice(0, -20);
    expect(extractFinalScore(points)).toEqual({
      scoreString: '6-4, 6-4, 2-3',
      setsWon: [2, 0],
      bestOf: 5,
      complete: false,
    });
    const result = validateMCPMatch({ match_id: MATCH_ID, points });
    expect(result.matchUp.matchUpFormat).toBe('SET5-S:6/TB7');
    expect(result.scoreMatches).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(['Match not complete. Final score: 6-4, 6-4, 2-3']);
  });

  it('mid-game does not credit the unfinished game', () => {
    const points = generateChart(MATCH_ID, '6-4 6-4 6-4').slice(0, -21);
    expect(extractFinalScore(points)?.scoreString).toBe('6-4, 6-4, 2-2');
    expect(validateMCPMatch({ match_id: MATCH_ID, points }).scoreMatches).toBe(true);
  });

  it('inside a tiebreak leaves the set open; on its last point closes it', () => {
    const points = generateChart(MATCH_ID, '6-4 7-6(3)');
    expect(extractFinalScore(points)?.scoreString).toBe('6-4, 7-6(3)');
    expect(extractFinalScore(points.slice(0, -1))).toEqual({
      scoreString: '6-4, 6-6',
      setsWon: [1, 0],
      bestOf: 3,
      complete: false,
    });
  });

  it('at a game that cannot end a set leaves the set open', () => {
    // 7-5 is built L W L W L W L W L W W W: dropping the last game leaves 6-5
    const points = generateChart(MATCH_ID, '7-5').slice(0, -4);
    expect(extractFinalScore(points)).toEqual({ scoreString: '6-5', setsWon: [0, 0], bestOf: 3, complete: false });
  });

  it('with a single opening point has no score to compare', () => {
    const [point] = generateChart(MATCH_ID, '6-4');
    expect(extractFinalScore([point])).toBeUndefined();
    const result = validateMCPMatch({ match_id: MATCH_ID, points: [point] });
    expect(result.expectedScore).toBeUndefined();
    expect(result.scoreMatches).toBeUndefined();
    expect(result.warnings).toContain('No format provided, using default SET3-S:6/TB7');
  });
});

describe("the last row's game-point test", () => {
  function lastRow(overrides: Partial<MCPPoint>): MCPPoint {
    return { ...generateChart(MATCH_ID, '6-4')[0], Set1: '0', Set2: '0', Gm1: '5', Gm2: '4', ...overrides };
  }

  it('the server converts from AD or 40, the receiver from AD or 40, and deuce goes on', () => {
    expect(extractFinalScore([lastRow({ Pts: 'AD-40', Svr: '1', PtWinner: '1' })])?.scoreString).toBe('6-4');
    expect(extractFinalScore([lastRow({ Pts: '40-15', Svr: '1', PtWinner: '1' })])?.scoreString).toBe('6-4');
    expect(extractFinalScore([lastRow({ Pts: '40-AD', Svr: '1', PtWinner: '2' })])?.scoreString).toBe('5-5');
    expect(extractFinalScore([lastRow({ Pts: '15-40', Svr: '2', PtWinner: '1' })])?.scoreString).toBe('6-4');
    expect(extractFinalScore([lastRow({ Pts: '40-40', Svr: '1', PtWinner: '1' })])?.scoreString).toBe('5-4');
    expect(extractFinalScore([lastRow({ Pts: '40-AD', Svr: '1', PtWinner: '1' })])?.scoreString).toBe('5-4');
    expect(extractFinalScore([lastRow({ Pts: '', Svr: '1', PtWinner: '1' })])?.scoreString).toBe('5-4');
  });

  it('a tiebreak ends at seven by two', () => {
    const tiebreak = (pts: string, svr: string, winner: string) =>
      extractFinalScore([lastRow({ Gm1: '6', Gm2: '6', Pts: pts, Svr: svr, PtWinner: winner })])?.scoreString;
    expect(tiebreak('6-3', '1', '1')).toBe('7-6(0)');
    expect(tiebreak('6-6', '1', '1')).toBe('6-6');
    expect(tiebreak('3-6', '1', '2')).toBe('6(0)-7');
    expect(tiebreak('15-0', '1', '1')).toBe('6-6');
  });
});
