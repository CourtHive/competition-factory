import * as governors from '@Assemblies/governors';
import { describe, expect, it } from 'vitest';
import * as tools from '@Assemblies/tools';

/**
 * Stateless positional functions have a home in `tools`, by domain, rather than in a governor that
 * mounts them on engines which call every method with one params object. `tools.formats` and `tools.scoring` match the
 * planned `formats` and `scoring` packages. In 7.x the governors still export the shared functions; each shared entry is
 * the governor's own function, so the two homes cannot drift before 8.0.0 removes the governor placements.
 *
 * Slice C of the engine API migration added the confirmed stateless governor queries, which take one
 * params object, to their domains (`QUERIES` below): `statelessGovernorTools.json` lists each one's home and
 * `statelessGovernorTools.test.ts` checks it is the governor function. Their engine routes are unchanged in 7.x.
 */

const FORMATS = [
  'aggregateDeciderSetNumber',
  'finalSetGoverns',
  'isAggregateFormat',
  'isValidMatchUpFormat',
  'parse',
  'stringify',
  'validateMatchUpFormat',
];
// the confirmed stateless governor queries each domain also holds (slice C), by the governor that exports them
const QUERIES = {
  formats: {
    tieFormatGovernor: ['compareTieFormats', 'tieFormatGenderValidityCheck'],
    scoreGovernor: ['validateTieFormat'],
    matchUpGovernor: ['calculateWinCriteria'],
  },
  scoring: {
    scoreGovernor: [
      'analyzeScore',
      'analyzeSet',
      'checkScoreHasValue',
      'checkSetIsComplete',
      'getMaxSetScore',
      'getSetComplement',
      'getTiebreakComplement',
      'keyValueScore',
      'mcpValidator',
      'pbpValidator',
      'repairScore',
      'retainScoreForFormat',
      'validateScore',
    ],
  },
  matchUps: {
    matchUpGovernor: [
      'analyzeMatchUp',
      'calculateMatchUpMargin',
      'filterMatchUps',
      'getCheckedInParticipantIds',
      'getDualIssues',
      'getHomeParticipantId',
      'getMatchUpCheckInState',
      'getMatchUpType',
      'getMatchUpUpset',
      'getRoundMatchUps',
      'participantScheduledMatchUps',
    ],
    scheduleGovernor: ['courtGridRows', 'matchUpScheduleLocked'],
  },
  draws: {
    drawsGovernor: [
      'getDrawTypeCoercion',
      'getFeedInQualifyingPositions',
      'getSeedingThresholds',
      'getTally',
      'getValidGroupSizes',
      'validatePlayoffGroups',
    ],
  },
  entries: {
    entriesGovernor: ['getEntryStatusOrdinals', 'getMaxEntryPosition'],
    eventGovernor: ['categoryCanContain'],
  },
  rankings: {
    rankingGovernor: ['generateRankingList', 'getAwardPoints', 'getAwardProfile'],
    participantGovernor: ['getScaleValues', 'participantScaleItem'],
  },
  seasons: {
    seasonGovernor: [
      'getSeasonAdvancement',
      'getSeasonMovement',
      'getSeasonStandings',
      'planNextPeriod',
      'validateSeason',
    ],
    tournamentGovernor: ['getTierMovement'],
  },
  sanctioning: { sanctioningGovernor: ['querySanctioningRecord', 'validateStatusTransition'] },
  officiating: { officiatingGovernor: ['queryOfficialRecord', 'validateOfficiatingStatusTransition'] },
};
const queriesOf = (domain: string): string[] => Object.values(QUERIES[domain] ?? {}).flat() as string[];

const GOVERNOR_SCORING = [
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
    expect(Object.keys(tools.formats).sort()).toEqual([...FORMATS, ...queriesOf('formats')].sort());
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

  it('validates a format code, without the governor isValid alias', () => {
    const { isValidMatchUpFormat, validateMatchUpFormat } = tools.formats;
    expect(isValidMatchUpFormat).toBe(governors.matchUpFormatGovernor.isValidMatchUpFormat);
    expect(validateMatchUpFormat).toBe(governors.matchUpFormatGovernor.validateMatchUpFormat);
    expect(isValidMatchUpFormat({ matchUpFormat: 'SET3-S:6/TB7' })).toEqual(true);
    expect(isValidMatchUpFormat({ matchUpFormat: 'SET2-S:6/TB7' })).toEqual(false);
    expect(validateMatchUpFormat({ matchUpFormat: 'SET3-S:6/TB7' })).toEqual({ valid: true });
    const invalid = validateMatchUpFormat({ matchUpFormat: 'SET2-S:6/TB7' });
    expect(invalid.valid).toEqual(false);
    expect(invalid.info).toContain('odd count');
    expect('isValid' in tools.formats).toEqual(false);
  });
});

describe('tools.scoring', () => {
  it('holds exactly the scoring functions', () => {
    expect(Object.keys(tools.scoring).sort()).toEqual(
      [...GOVERNOR_SCORING, ...queriesOf('scoring'), 'parseScoreString'].sort(),
    );
  });

  it.each(GOVERNOR_SCORING)('%s is the score governor function', (name) => {
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
    expect(Object.keys(tools[domain]).sort()).toEqual([...names, ...queriesOf(domain)].sort());
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
  it('holds the award window, the derived-list function and the points readers', () => {
    expect(Object.keys(tools.rankings).sort()).toEqual(
      [
        'DEFAULT_ROLLING_PERIOD_DAYS',
        'computeAwardWindow',
        'deriveRankingList',
        'getParticipantPoints',
        'getQualityWinPoints',
        'isAwardInWindow',
        'rollingPeriodDaysFrom',
        ...queriesOf('rankings'),
      ].sort(),
    );
  });

  it('deriveRankingList is the ranking governor applyDerivedRankings, under a derivation name', () => {
    expect(tools.rankings.deriveRankingList).toBe(governors.rankingGovernor.applyDerivedRankings);
  });

  it.each(['getParticipantPoints', 'getQualityWinPoints'])('%s is the ranking governor function', (name) => {
    expect(tools.rankings[name]).toBe(governors.rankingGovernor[name]);
  });

  it('totals one person from point awards', () => {
    const pointAwards: any[] = [
      { personId: 'p1', points: 100 },
      { personId: 'p1', points: 50 },
      { personId: 'p2', points: 70 },
    ];
    expect(tools.rankings.getParticipantPoints({ pointAwards, personId: 'p1' }).totalPoints).toEqual(150);
  });

  it('is the window generateRankingList applies', () => {
    expect(tools.rankings.computeAwardWindow('2025-12-31', 365)).toEqual({ from: '2024-12-31', to: '2025-12-31' });
  });
});

describe.each(Object.entries(QUERIES))('tools.%s: the confirmed stateless queries', (domain, byGovernor) => {
  const entries = Object.entries(byGovernor).flatMap(([governor, names]) => names.map((name) => [name, governor]));

  it.each(entries)(`%s is the %s function`, (name, governor) => {
    expect(typeof tools[domain][name]).toEqual('function');
    expect(tools[domain][name]).toBe(governors[governor][name]);
  });
});

describe('the new domains hold only the confirmed stateless queries', () => {
  it.each(['seasons', 'sanctioning', 'officiating'])('tools.%s', (domain) => {
    expect(Object.keys(tools[domain]).sort()).toEqual(queriesOf(domain).sort());
  });
});

describe('a tool called with a params object, as a 7.x engine route is', () => {
  it('reads a score, a format and a matchUp', () => {
    expect(tools.scoring.checkScoreHasValue({ score: { sets: [{ side1Score: 1 }] } })).toEqual(true);
    expect(tools.scoring.getSetComplement({ isSide1: true, lowValue: 3, setTo: 6, tiebreakAt: 6 })).toEqual([3, 6]);
    expect(tools.draws.getValidGroupSizes({ drawSize: 8 }).validGroupSizes).toContain(4);
  });

  it('refuses a missing required input instead of throwing', () => {
    expect(tools.rankings.generateRankingList({} as any)).toMatchObject({ error: { code: 'ERR_MISSING_VALUE' } });
    expect(tools.rankings.deriveRankingList({} as any)).toMatchObject({ error: { code: 'ERR_MISSING_VALUE' } });
  });
});
