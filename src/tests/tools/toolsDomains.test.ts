import * as governors from '@Assemblies/governors';
import { describe, expect, it } from 'vitest';
import * as tools from '@Assemblies/tools';

/**
 * Stateless positional functions have a home in `tools`, by domain (CA 2026-11-07), rather than in a governor that
 * mounts them on engines which call every method with one params object. `tools.formats` and `tools.scoring` match the
 * planned `formats` and `scoring` packages. In 7.x the governors still export the same functions; each `tools` entry is
 * the governor's own function, so the two homes cannot drift before 8.0.0 removes the governor placements.
 */

const FORMATS = ['aggregateDeciderSetNumber', 'finalSetGoverns', 'isAggregateFormat', 'parse', 'stringify'];
const SCORING = [
  'addPoint',
  'analyzeSequence',
  'calculateMatchStatistics',
  'calculatePointsTo',
  'deduceMatchUpFormat',
  'enrichPointHistory',
  'exportMatchUpJSON',
  'getEpisodes',
  'getQuickStats',
  'getScore',
  'getScoreboard',
  'getSetScoreString',
  'getWinner',
  'groupByMatch',
  'inferServeSide',
  'isComplete',
  'parseCSV',
  'parseMCPPoint',
  'pointParser',
  'resolvePointValue',
  'shotParser',
  'shotSplitter',
  'toStatObjects',
  'validateMCPMatch',
  'validateMatchUpScore',
  'validateSetScore',
];

describe('tools.formats', () => {
  it('holds exactly the matchUpFormat functions', () => {
    expect(Object.keys(tools.formats).sort()).toEqual([...FORMATS].sort());
  });

  it.each(FORMATS)('%s is the matchUpFormat governor function', (name) => {
    expect(tools.formats[name]).toBe(governors.matchUpFormatGovernor[name]);
  });

  it('parses and stringifies a format code', () => {
    const code = 'SET3-S:6/TB7-F:TB10';
    expect(tools.formats.stringify(tools.formats.parse(code))).toEqual(code);
    // the score governor's aliases are the same functions
    expect(governors.scoreGovernor.parseMatchUpFormat).toBe(tools.formats.parse);
    expect(governors.scoreGovernor.stringifyMatchUpFormat).toBe(tools.formats.stringify);
  });
});

describe('tools.scoring', () => {
  it('holds exactly the scoring functions', () => {
    expect(Object.keys(tools.scoring).sort()).toEqual([...SCORING].sort());
  });

  it.each(SCORING)('%s is the score governor function', (name) => {
    expect(tools.scoring[name]).toBe(governors.scoreGovernor[name]);
  });

  it('validates a score positionally', () => {
    const impossible = [{ setNumber: 1, side1Score: 7, side2Score: 2 }];
    expect(tools.scoring.validateMatchUpScore(impossible, 'SET3-S:6/TB7').isValid).toEqual(false);
  });
});
