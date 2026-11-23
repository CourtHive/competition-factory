import { tools, scoreGovernor } from '../../index';
import { describe, expect, it } from 'vitest';

const standard = 'SET3-S:6/TB7';
const strict = (score: string, matchUpFormat = standard) =>
  tools.scoring.parseScoreString(score, { strict: true, matchUpFormat });

describe('tools.scoring.parseScoreString', () => {
  it('retains permissive object-call parsing in the positional default', () => {
    for (const scoreString of ['', '2-1', '7-6(5)', '7-6(4)x [10-8]', 'junk']) {
      const previous = scoreGovernor.parseScoreString({ scoreString, matchUpFormat: standard });
      expect(tools.scoring.parseScoreString(scoreString, { matchUpFormat: standard })).toStrictEqual(previous);
    }
  });

  it('requires a readable format before parsing', () => {
    expect(tools.scoring.parseScoreString('6-4', { strict: true })).toMatchObject({
      reason: 'FORMAT_REQUIRED',
      error: { code: 'ERR_MISSING_MATCHUP_FORMAT' },
    });
    expect(strict('6-4', standard + ';tail')).toMatchObject({
      reason: 'INVALID_FORMAT',
      error: { code: 'ERR_INVALID_MATCHUP_FORMAT' },
    });
  });

  it.each(['7-6(5)', '6(5)-7', '7-6', '6-7[5-7]', '  6-4\t4-6\n7-5  '])('reads complete tokens: %s', (score) => {
    expect(Array.isArray(strict(score))).toBe(true);
  });

  it.each([
    '6-4x',
    'RET',
    '7-6(5)tail',
    '6-3-1',
    '6(2)-7(4)',
    '7(4)-6',
    '[10-8]x',
    '[10-8]',
    '6-4[7-x]',
    '2e2-3',
    '-1-3',
    '6.2-3',
    '9007199254740992-6',
  ])('consumes the entire token: %s', (token) => {
    expect(strict('6-4 ' + token)).toMatchObject({ reason: 'INVALID_SYNTAX', setNumber: 2 });
  });

  it('rejects an empty strict input', () => expect(strict('  ')).toMatchObject({ reason: 'INVALID_SYNTAX' }));

  it.each([
    [standard, '7-3'],
    [standard, '2-1'],
    [standard, '7-6[7-6]'],
    [standard, '7-6[3-7]'],
    ['SET1-S:TB10', '[10-9]'],
    ['SET1-S:P32DP', '16-16'],
    ['SET1-S:T10', '0-0'],
  ])('reports the actual set validator refusal for %s %s', (format, scoreString) => {
    const [set] = scoreGovernor.parseScoreString({ scoreString, matchUpFormat: format });
    const verdict = tools.scoring.validateSetScore(set, format, false, false);
    expect(verdict.isValid).toBe(false);
    expect(strict(scoreString, format)).toMatchObject({
      error: { code: 'ERR_INVALID_SCORE' },
      reason: 'INVALID_SET_SCORE',
      info: verdict.error,
      setNumber: 1,
    });
  });

  it.each([
    ['SET3-S:6/TB7-F:TB10', '6-3 3-6 [10-8]'],
    ['SET3XA-S:T10-F:TB1', '5-3 3-4 4-5 [0-1]'],
    ['SET1-S:P32', '16-16'],
    ['SET1-S:P32DP', '17-16'],
    ['SET1-S:TB10', '1-0'],
    ['HAL2XA-S:T45P-O:2X/T15P-F:SO5', '1-1 0-0 1-1 0-0 5-4'],
  ])('accepts finished sets under %s', (format, score) => expect(Array.isArray(strict(score, format))).toBe(true));

  it('reads an explicit timed tiebreak in side order and refuses an ambiguous shorthand', () => {
    const format = 'SET3-S:T10P/TB7';
    expect(strict('4-4[2-7]', format)).toMatchObject([
      { winningSide: 2, side1TiebreakScore: 2, side2TiebreakScore: 7 },
    ]);
    expect(strict('4-4(2)', format)).toMatchObject({ reason: 'INVALID_SYNTAX' });
    expect(strict('4-4', format)).toMatchObject({
      reason: 'INVALID_SET_SCORE',
      info: 'Tied timed set requires tiebreak',
    });
  });

  it('requires the format to have a tiebreak when interpreting explicit points', () => {
    expect(strict('7-5[7-3]', 'SET1-S:6')).toMatchObject({ reason: 'INVALID_SYNTAX' });
  });

  it('expands short tiebreak notation with the format margin and every digit', () => {
    expect(strict('5-4(4)', 'SET1-S:4/TB5NOAD')).toMatchObject([{ side1TiebreakScore: 5, side2TiebreakScore: 4 }]);
    expect(strict('6(103)-7')).toMatchObject([{ side1TiebreakScore: 103, side2TiebreakScore: 105 }]);
  });

  it.each([
    [standard, '6-3 6-3 4-6'],
    [standard, '6-3 4-6 6-4 4-6'],
    ['SET3XA-S:T10-F:TB1', '5-3 3-4 6-5 [1-0]'],
  ])('reports the shared sequence refusal for %s %s', (format, scoreString) => {
    const sets = scoreGovernor.parseScoreString({ scoreString, matchUpFormat: format });
    const verdict = tools.scoring.validateMatchUpScore(sets, format);
    expect(verdict.isValid).toBe(false);
    expect(strict(scoreString, format)).toMatchObject({ reason: 'INVALID_SET_SEQUENCE', info: verdict.error });
  });
});
