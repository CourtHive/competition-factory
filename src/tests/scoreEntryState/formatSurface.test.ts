import { checkSetIsComplete as canonicalComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
import { retainScoreForFormat as canonicalRetain } from '@Query/matchUp/retainScoreForFormat';
import { stringify as canonicalStringify } from '@Helpers/matchUpFormatCode/stringify';
import { parse as canonicalParse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';
import {
  parseMatchUpFormat,
  stringifyMatchUpFormat,
  retainScoreForFormat,
  finalSetGoverns,
  aggregateDeciderSetNumber,
  checkSetIsComplete,
} from '../../scoreEntryState';
import {
  finalSetGoverns as canonicalFinal,
  aggregateDeciderSetNumber as canonicalDecider,
} from '@Helpers/matchUpFormatCode/aggregateDecider';

describe('pure format editor surface', () => {
  it('exports the canonical operations without a second implementation', () => {
    expect(parseMatchUpFormat).toBe(canonicalParse);
    expect(stringifyMatchUpFormat).toBe(canonicalStringify);
    expect(retainScoreForFormat).toBe(canonicalRetain);
    expect(finalSetGoverns).toBe(canonicalFinal);
    expect(aggregateDeciderSetNumber).toBe(canonicalDecider);
    expect(checkSetIsComplete).toBe(canonicalComplete);
  });
  it('round trips a deciding match tiebreak and rejects malformed input', () => {
    const code = 'SET3-S:6NOAD/TB7-F:TB10';
    expect(stringifyMatchUpFormat(parseMatchUpFormat(code))).toBe(code);
    expect(parseMatchUpFormat('not a format')).toBeUndefined();
  });
  it('retains played sets and reports incompatible deciding games without mutating input', () => {
    const sets = [
      { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
      { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
      { setNumber: 3, side1Score: 2, side2Score: 1 },
    ];
    const before = structuredClone(sets);
    const result = retainScoreForFormat({
      sets,
      previousMatchUpFormat: 'SET3-S:6/TB7',
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
    });
    expect(result.sets).toEqual(sets.slice(0, 2));
    expect(result.discarded).toEqual([sets[2]]);
    expect(sets).toEqual(before);
  });
});
