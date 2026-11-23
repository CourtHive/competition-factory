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

const DOMAINS = {
  publishing: {
    governor: 'publishingGovernor',
    names: ['getRoundVisibilityState', 'isEmbargoed', 'isVisiblyPublished'],
  },
  entries: { governor: 'entriesGovernor', names: ['getEntryFeeRange', 'isIndeterminateFee', 'resolveEntryFee'] },
  draws: { governor: 'drawsGovernor', names: ['isAdHocType', 'isLadder'] },
  matchUps: { governor: 'matchUpGovernor', names: ['validMatchUp', 'validMatchUps'] },
};

describe.each(Object.entries(DOMAINS))('tools.%s', (domain, { governor, names }) => {
  it('holds exactly its functions', () => {
    expect(Object.keys(tools[domain]).sort()).toEqual([...names].sort());
  });

  it.each(names)(`%s is the ${governor} function`, (name) => {
    expect(tools[domain][name]).toBe(governors[governor][name]);
  });
});

describe('tools.publishing takes the instant as an input', () => {
  const { getRoundVisibilityState, isEmbargoed, isVisiblyPublished } = tools.publishing;
  const embargo = '2026-11-07T12:00:00.000Z';
  const before = '2026-11-07T11:00:00.000Z';
  const after = new Date('2026-11-07T13:00:00.000Z');

  it('judges an embargo at asOf, as an ISO instant or a Date', () => {
    expect(isEmbargoed({ embargo }, before)).toEqual(true);
    expect(isEmbargoed({ embargo }, after)).toEqual(false);
    expect(isVisiblyPublished({ published: true, embargo }, before)).toEqual(false);
    expect(isVisiblyPublished({ published: true, embargo }, after)).toEqual(true);
  });

  it('falls back to the competition clock without asOf (7.x)', () => {
    expect(isEmbargoed({ embargo: '2000-01-01T00:00:00.000Z' })).toEqual(false);
    expect(isEmbargoed({ embargo: '2999-01-01T00:00:00.000Z' })).toEqual(true);
  });

  it('applies asOf to every round', () => {
    const structureDetail = { scheduledRounds: { 2: { embargo } } };
    const matchUps = [{ roundNumber: 1 }, { roundNumber: 2 }];
    expect(getRoundVisibilityState(structureDetail, matchUps, before)).toEqual({ 2: { embargoed: true } });
    expect(getRoundVisibilityState(structureDetail, matchUps, after)).toBeUndefined();
  });
});

describe('tools.rankings', () => {
  it('holds the award window and the derived-list function', () => {
    expect(Object.keys(tools.rankings).sort()).toEqual(
      [
        'DEFAULT_ROLLING_PERIOD_DAYS',
        'computeAwardWindow',
        'deriveRankingList',
        'isAwardInWindow',
        'rollingPeriodDaysFrom',
      ].sort(),
    );
  });

  it('deriveRankingList is the ranking governor applyDerivedRankings, under a derivation name', () => {
    expect(tools.rankings.deriveRankingList).toBe(governors.rankingGovernor.applyDerivedRankings);
  });

  it('is the window generateRankingList applies', () => {
    expect(tools.rankings.computeAwardWindow('2025-12-31', 365)).toEqual({ from: '2024-12-31', to: '2025-12-31' });
  });
});
