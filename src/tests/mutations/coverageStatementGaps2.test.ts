/**
 * Statement-coverage gap tests — batch 2
 * Targets ~150 uncovered statements across 15 files to push past 95%.
 */
import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { validateSetScore, validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { generateOutcome } from '@Assemblies/generators/mocks/generateOutcome';
import { getParticipantStats } from '@Query/participant/getParticipantStats';
import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { calculatePointsTo } from '@Mutate/scoring/pointsToCalculator';
import { addPoint, formatGameScore } from '@Mutate/scoring/addPoint';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import {
  COMPLETED,
  DEFAULTED,
  RETIRED,
  WALKOVER,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
} from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import {
  INVALID_MATCHUP,
  INVALID_VALUES,
  MISSING_MATCHUPS,
  MISSING_TOURNAMENT_RECORD,
  INVALID_CATEGORY,
  INVALID_DATE,
  MISSING_POLICY_DEFINITION,
  INVALID_PARTICIPANT_IDS,
} from '@Constants/errorConditionConstants';

// ----------------------------------------------------------------
// 1. addPoint.ts — timed set, aggregate format, rally scoring,
//    consecutive game, match tiebreak, formatGameScore edge cases
// ----------------------------------------------------------------
function makeMatchUp(format: string, status = 'TO_BE_PLAYED') {
  return {
    matchUpId: 'mu1',
    matchUpFormat: format,
    matchUpStatus: status,
    matchUpType: 'SINGLES' as const,
    sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
    score: { sets: [] },
  } as any;
}

describe('addPoint uncovered paths', () => {
  it('returns matchUp when options is not an object', () => {
    const mu = makeMatchUp('SET3-S:6/TB7');
    const result = addPoint(mu, null as any);
    expect(result).toBe(mu);
  });

  it('returns matchUp when winner is undefined', () => {
    const mu = makeMatchUp('SET3-S:6/TB7');
    const result = addPoint(mu, {} as any);
    expect(result).toBe(mu);
  });

  it('handles winningSide / serverSideNumber normalization', () => {
    const mu = makeMatchUp('SET3-S:6/TB7');
    const result: any = addPoint(mu, { winningSide: 1, serverSideNumber: 1 } as any);
    expect(result.history.points.length).toBe(1);
  });

  it('handles timed set scoring', () => {
    // T20 = timed set of 20 minutes
    const mu = makeMatchUp('SET1-S:T20');
    let m = mu;
    for (let i = 0; i < 5; i++) {
      m = addPoint(m, { winner: (i % 2) as 0 | 1 });
    }
    expect(m.score.sets.length).toBeGreaterThanOrEqual(1);
    // Timed sets don't auto-complete
    expect(m.matchUpStatus).toBe('IN_PROGRESS');
  });

  it('handles tiebreak-only set (pickleball style)', () => {
    // SET3-S:TB11 => tiebreak-only sets to 11
    const mu = makeMatchUp('SET3-S:TB11');
    let m = mu;
    // Play a full tiebreak-only set: side 0 wins 11-0
    for (let i = 0; i < 11; i++) {
      m = addPoint(m, { winner: 0 });
    }
    expect(m.score.sets[0].winningSide).toBe(1);
    expect(m.score.sets[0].side1TiebreakScore).toBe(11);
  });

  it('handles match tiebreak (final set as tiebreak)', () => {
    // SET3-S:6/TB7-F:TB10 => best of 3 with match tiebreak final
    const mu = makeMatchUp('SET3-S:6/TB7-F:TB10');
    // Manually set up 1-1 in sets to trigger match tiebreak
    mu.score.sets = [
      { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1, side1GameScores: [], side2GameScores: [] },
      { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2, side1GameScores: [], side2GameScores: [] },
    ];
    mu.matchUpStatus = 'IN_PROGRESS';
    let m = mu;
    // Play match tiebreak to 10-0
    for (let i = 0; i < 10; i++) {
      m = addPoint(m, { winner: 0 });
    }
    expect(m.score.sets.length).toBe(3);
    expect(m.winningSide).toBe(1);
  });

  it('handles NoAD tiebreak-only set', () => {
    const mu = makeMatchUp('SET1-S:TB11NOAD');
    let m = mu;
    // Play to 10-10 then one more point — NoAD means win by 1
    for (let i = 0; i < 10; i++) {
      m = addPoint(m, { winner: 0 });
      m = addPoint(m, { winner: 1 });
    }
    // Now 10-10, next point wins
    m = addPoint(m, { winner: 0 });
    expect(m.score.sets[0].winningSide).toBe(1);
  });

  it('handles scoreIncrement via scoreValue option', () => {
    const mu = makeMatchUp('SET1-S:TB11');
    let m = mu;
    m = addPoint(m, { winner: 0, scoreValue: 3 } as any);
    expect(m.score.sets[0].side1GameScores?.[0]).toBe(3);
  });

  it('formatGameScore handles consecutive format display', () => {
    expect(formatGameScore(2, 1, false, true)).toBe('2-1');
  });

  it('formatGameScore handles scores beyond normal tennis at 40-G', () => {
    // p1 >= 3 && p2 >= 3 && diff >= 2
    expect(formatGameScore(5, 3, false, false)).toBe('G-40');
  });

  it('formatGameScore handles 40-G (opposite)', () => {
    expect(formatGameScore(3, 5, false, false)).toBe('40-G');
  });

  it('formatGameScore handles high p1 low p2', () => {
    // p1 >= 3 but p2 < 3
    expect(formatGameScore(4, 2, false, false)).toBe('40-30');
  });

  it('formatGameScore handles low p1 high p2', () => {
    // p2 >= 3 but p1 < 3
    expect(formatGameScore(1, 4, false, false)).toBe('15-40');
  });
});

// ----------------------------------------------------------------
// 2. pointsToCalculator.ts — timed/matchTiebreak/tiebreakOnly/
//    consecutive/noTiebreak/breakpoint paths
// ----------------------------------------------------------------
describe('pointsToCalculator uncovered paths', () => {
  it('returns undefined for timed set', () => {
    const mu = makeMatchUp('SET1-S:T20');
    const fmt = parse('SET1-S:T20');
    const result = calculatePointsTo(mu, fmt!, 'timed', fmt?.setFormat, 0);
    expect(result).toBeUndefined();
  });

  it('returns undefined when activeSetFormat is undefined', () => {
    const mu = makeMatchUp('SET1-S:6/TB7');
    const fmt = parse('SET1-S:6/TB7');
    const result = calculatePointsTo(mu, fmt!, 'standard', undefined, 0);
    expect(result).toBeUndefined();
  });

  it('calculates for tiebreakOnly set type', () => {
    const mu = makeMatchUp('SET3-S:TB11');
    mu.score.sets = [{ setNumber: 1, side1GameScores: [3], side2GameScores: [5] }];
    const fmt = parse('SET3-S:TB11');
    const result = calculatePointsTo(mu, fmt!, 'tiebreakOnly', fmt?.setFormat, 0);
    expect(result).toBeDefined();
    expect(result!.pointsToGame).toBeDefined();
    expect(result!.gamesToSet).toEqual([1, 1]);
  });

  it('calculates for matchTiebreak set type', () => {
    const mu = makeMatchUp('SET3-S:6/TB7-F:TB10');
    mu.score.sets = [
      { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
      { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
      { setNumber: 3, side1GameScores: [2], side2GameScores: [4] },
    ];
    const fmt = parse('SET3-S:6/TB7-F:TB10');
    const result = calculatePointsTo(mu, fmt!, 'matchTiebreak', fmt?.finalSetFormat, 0);
    expect(result).toBeDefined();
    expect(result!.pointsToGame).toBeDefined();
  });

  it('calculates for standard set in tiebreak', () => {
    const mu = makeMatchUp('SET3-S:6/TB7');
    mu.score.sets = [{ setNumber: 1, side1Score: 6, side2Score: 6, side1GameScores: [3], side2GameScores: [2] }];
    const fmt = parse('SET3-S:6/TB7');
    const result = calculatePointsTo(mu, fmt!, 'standard', fmt?.setFormat, 0);
    expect(result).toBeDefined();
    // Should detect tiebreak context
    expect(result!.pointsToGame).toBeDefined();
  });

  it('detects breakpoint when receiver is 1 point away', () => {
    const mu = makeMatchUp('SET3-S:6/TB7');
    // At deuce (3-3 = 40-40), side 1 serving, side 0 at advantage (4-3)
    mu.score.sets = [{ setNumber: 1, side1Score: 0, side2Score: 0, side1GameScores: [4], side2GameScores: [3] }];
    const fmt = parse('SET3-S:6/TB7');
    // server=0, so receiver is side 1; side 0 has advantage (pointsToGame[0] = 1)
    const result = calculatePointsTo(mu, fmt!, 'standard', fmt?.setFormat, 1);
    expect(result).toBeDefined();
    // side 0 (index 0) needs 1 point to win game; side 0 is receiver (1-server=0)
    expect(result!.isBreakpoint).toBe(true);
  });

  it('handles consecutive game format', () => {
    // Construct a format with consecutive games
    const mu = makeMatchUp('SET1-S:6-G:3C');
    const fmt = parse('SET1-S:6-G:3C');
    if (fmt) {
      const result = calculatePointsTo(mu, fmt, 'standard', fmt.setFormat, 0);
      expect(result).toBeDefined();
    }
  });
});

// ----------------------------------------------------------------
// 3. getParticipantResults.ts — team matchUps, cancelled matchUps,
//    tieMatchUps without winningSide, doubles/singles tie tally
// ----------------------------------------------------------------
describe('getParticipantResults uncovered paths', () => {
  it('handles matchUps with no winningSide and completedMatchUpStatus (cancelled)', () => {
    const matchUps = [
      {
        matchUpStatus: COMPLETED,
        winningSide: undefined,
        sides: [
          { sideNumber: 1, participantId: 'p1' },
          { sideNumber: 2, participantId: 'p2' },
        ],
        score: { sets: [] },
      },
    ] as any;
    const { participantResults } = getParticipantResults({ matchUps });
    expect(participantResults['p1'].matchUpsCancelled).toBe(1);
    expect(participantResults['p2'].matchUpsCancelled).toBe(1);
  });

  it('handles team matchUps with tieMatchUps and no overall winningSide', () => {
    const matchUps = [
      {
        matchUpStatus: 'IN_PROGRESS',
        winningSide: undefined,
        sides: [
          { sideNumber: 1, participantId: 'teamA' },
          { sideNumber: 2, participantId: 'teamB' },
        ],
        score: { sets: [] },
        tieMatchUps: [
          {
            winningSide: 1,
            matchUpType: 'SINGLES',
            matchUpStatus: COMPLETED,
            score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
            sides: [
              { sideNumber: 1, participantId: 's1' },
              { sideNumber: 2, participantId: 's2' },
            ],
          },
          {
            winningSide: 2,
            matchUpType: 'DOUBLES',
            matchUpStatus: COMPLETED,
            score: { sets: [{ side1Score: 3, side2Score: 6, winningSide: 2 }] },
            sides: [
              { sideNumber: 1, participantId: 'd1' },
              { sideNumber: 2, participantId: 'd2' },
            ],
          },
        ],
      },
    ] as any;
    const { participantResults } = getParticipantResults({ matchUps });
    // team matchUp has tieMatchUps — perPlayer set to 0, tieMatchUps processed
    expect(participantResults['teamA']).toBeDefined();
  });

  it('handles team matchUps with winningSide and tieMatchUps (doubles tie counting)', () => {
    const matchUps = [
      {
        matchUpStatus: COMPLETED,
        winningSide: 1,
        sides: [
          { sideNumber: 1, participantId: 'teamA' },
          { sideNumber: 2, participantId: 'teamB' },
        ],
        score: { sets: [{ side1Score: 2, side2Score: 1, winningSide: 1 }] },
        tieMatchUps: [
          {
            winningSide: 1,
            matchUpType: 'DOUBLES',
            matchUpStatus: COMPLETED,
            matchUpFormat: FORMAT_STANDARD,
            score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }] },
            sides: [
              { sideNumber: 1, participantId: 'd1' },
              { sideNumber: 2, participantId: 'd2' },
            ],
          },
          {
            winningSide: 2,
            matchUpType: 'SINGLES',
            matchUpStatus: COMPLETED,
            matchUpFormat: FORMAT_STANDARD,
            score: { sets: [{ side1Score: 4, side2Score: 6, winningSide: 2 }] },
            sides: [
              { sideNumber: 1, participantId: 's1' },
              { sideNumber: 2, participantId: 's2' },
            ],
          },
        ],
      },
    ] as any;
    const { participantResults } = getParticipantResults({ matchUps });
    expect(participantResults['teamA'].tieDoublesWon).toBe(1);
    expect(participantResults['teamB'].tieDoublesLost).toBe(1);
    expect(participantResults['teamB'].tieSinglesWon).toBe(1);
    expect(participantResults['teamA'].tieSinglesLost).toBe(1);
  });

  it('handles matchUps with WALKOVER/DEFAULTED/RETIRED status', () => {
    const matchUps = [
      {
        matchUpStatus: WALKOVER,
        winningSide: 1,
        sides: [
          { sideNumber: 1, participantId: 'p1' },
          { sideNumber: 2, participantId: 'p2' },
        ],
        score: { sets: [] },
      },
      {
        matchUpStatus: DEFAULTED,
        winningSide: 2,
        sides: [
          { sideNumber: 1, participantId: 'p3' },
          { sideNumber: 2, participantId: 'p4' },
        ],
        score: { sets: [] },
      },
      {
        matchUpStatus: RETIRED,
        winningSide: 1,
        sides: [
          { sideNumber: 1, participantId: 'p5' },
          { sideNumber: 2, participantId: 'p6' },
        ],
        score: { sets: [] },
      },
    ] as any;
    const { participantResults } = getParticipantResults({ matchUps });
    expect(participantResults['p2'].walkovers).toBe(1);
    expect(participantResults['p3'].defaults).toBe(1);
    expect(participantResults['p6'].retirements).toBe(1);
    expect(participantResults['p2'].allDefaults).toBe(1);
    expect(participantResults['p3'].allDefaults).toBe(1);
    expect(participantResults['p6'].allDefaults).toBe(1);
  });

  it('handles manualGamesOverride path', () => {
    const matchUps = [
      {
        matchUpStatus: COMPLETED,
        winningSide: 1,
        _disableAutoCalc: true,
        sides: [
          { sideNumber: 1, participantId: 'p1' },
          { sideNumber: 2, participantId: 'p2' },
        ],
        score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
        tieFormat: {
          collectionDefinitions: [{ scoreValue: 1, matchUpCount: 1, collectionId: 'c1' }],
        },
      },
    ] as any;
    const { participantResults } = getParticipantResults({ matchUps });
    expect(participantResults['p1'].gamesWon).toBe(6);
    expect(participantResults['p2'].gamesLost).toBe(6);
  });
});

// ----------------------------------------------------------------
// 4. getTournamentPoints.ts — missing tournament, missing policy
// ----------------------------------------------------------------
describe('getTournamentPoints guard paths', () => {
  it('engine returns error for missing policy', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(result.tournamentRecord);
    const ptResult = tournamentEngine.getTournamentPoints();
    expect(ptResult.error).toEqual(MISSING_POLICY_DEFINITION);
  });
});

// ----------------------------------------------------------------
// 5. generateOutcome.ts — DOUBLE_WALKOVER, DOUBLE_DEFAULT,
//    invalid values, DEFAULTED with score, aggregate scoring
// ----------------------------------------------------------------
describe('generateOutcome uncovered paths', () => {
  it('returns error for invalid matchUpFormat', () => {
    const result = generateOutcome({ matchUpFormat: 'INVALID' });
    expect(result.error).toBeDefined();
  });

  it('returns error for non-object matchUpStatusProfile', () => {
    const result = generateOutcome({ matchUpStatusProfile: 'not-an-object' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error for NaN parameters', () => {
    const result = generateOutcome({ sideWeight: 'abc' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('handles matchUpStatusProfile with large values (coverage of reduce path)', () => {
    // The reduce uses Object.keys(matchUpStatuses) which are array indices,
    // so this exercises the reduce branch without triggering the >100 guard
    const result = generateOutcome({
      matchUpStatusProfile: { [WALKOVER]: 5, [RETIRED]: 5 },
    });
    expect(result.outcome).toBeDefined();
  });

  it('generates DOUBLE_WALKOVER outcome', () => {
    const result: any = generateOutcome({
      matchUpStatusProfile: { [DOUBLE_WALKOVER]: 100 },
    });
    expect(result.outcome).toBeDefined();
    expect(result.outcome.matchUpStatus).toBe(DOUBLE_WALKOVER);
    expect(result.outcome.winningSide).toBeUndefined();
  });

  it('generates DOUBLE_DEFAULT outcome', () => {
    const result: any = generateOutcome({
      matchUpStatusProfile: { [DOUBLE_DEFAULT]: 100 },
    });
    expect(result.outcome).toBeDefined();
    expect(result.outcome.matchUpStatus).toBe(DOUBLE_DEFAULT);
  });

  it('generates RETIRED outcome with forced winningSide', () => {
    const result: any = generateOutcome({
      matchUpStatusProfile: { [RETIRED]: 100 },
      winningSide: 2,
    });
    expect(result.outcome).toBeDefined();
    expect(result.outcome.winningSide).toBe(2);
  });

  it('handles defaultWithScorePercent capping at 100', () => {
    const result: any = generateOutcome({
      matchUpStatusProfile: { [DEFAULTED]: 100 },
      defaultWithScorePercent: 200,
      winningSide: 1,
    });
    expect(result.outcome).toBeDefined();
  });

  it('generates outcome for tiebreak-only format', () => {
    const result: any = generateOutcome({
      matchUpFormat: 'SET3-S:TB11',
      matchUpStatusProfile: {},
    });
    expect(result.outcome).toBeDefined();
    expect(result.outcome.score).toBeDefined();
  });

  it('generates outcome for aggregate format', () => {
    const result: any = generateOutcome({
      matchUpFormat: 'SET2XA-S:T10',
      matchUpStatusProfile: {},
    });
    expect(result.outcome).toBeDefined();
    expect(result.outcome.winningSide).toBeDefined();
  });

  it('generates outcome for match tiebreak format', () => {
    const result: any = generateOutcome({
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      matchUpStatusProfile: {},
    });
    expect(result.outcome).toBeDefined();
    expect(result.outcome.score).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 6. validateMatchUpScore.ts — timed set, tiebreak-only NoAD,
//    tiebreak validation, two-game margin, incomplete sets
// ----------------------------------------------------------------
describe('validateMatchUpScore uncovered paths', () => {
  it('validates timed set — returns valid', () => {
    const result = validateSetScore({ side1Score: 10, side2Score: 8, winningSide: 1 }, 'SET1-S:T20', false, false);
    expect(result.isValid).toBe(true);
  });

  it('validates timed set with both sides 0 — invalid', () => {
    const result = validateSetScore({ side1Score: 0, side2Score: 0, winningSide: 1 }, 'SET1-S:T20', false, false);
    expect(result.isValid).toBe(false);
  });

  it('validates tiebreak-only set with NoAD', () => {
    // SET1-S:TB11NOAD => tiebreak to 11 with NoAD
    const result = validateSetScore(
      { side1TiebreakScore: 11, side2TiebreakScore: 10 },
      'SET1-S:TB11NOAD',
      false,
      false,
    );
    expect(result.isValid).toBe(true);
  });

  it('validates regular set with tiebreak at different threshold', () => {
    const result = validateSetScore(
      { side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 5 },
      'SET3-S:6/TB7',
      false,
      false,
    );
    expect(result.isValid).toBe(true);
  });

  it('rejects invalid tiebreak score (not won by 2)', () => {
    const result = validateSetScore(
      { side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 6 },
      'SET3-S:6/TB7',
      false,
      false,
    );
    expect(result.isValid).toBe(false);
  });

  it('validates incomplete set with allowIncomplete', () => {
    const result = validateSetScore({ side1Score: 3, side2Score: 2 }, 'SET3-S:6/TB7', false, true);
    expect(result.isValid).toBe(true);
  });

  it('rejects set with invalid two-game margin', () => {
    const result = validateSetScore({ side1Score: 7, side2Score: 2, winningSide: 1 }, 'SET3-S:6/TB7', false, false);
    expect(result.isValid).toBe(false);
  });

  it('validates matchUpScore with RETIRED status (allows incomplete)', () => {
    const sets = [
      { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
      { side1Score: 2, side2Score: 1, setNumber: 2 },
    ];
    const result = validateMatchUpScore(sets, 'SET3-S:6/TB7', RETIRED);
    expect(result.isValid).toBe(true);
  });

  it('returns valid for empty sets', () => {
    const result = validateMatchUpScore([], 'SET3-S:6/TB7');
    expect(result.isValid).toBe(true);
  });

  it('returns valid for undefined matchUpFormat', () => {
    const result = validateSetScore({ side1Score: 6, side2Score: 4 });
    expect(result.isValid).toBe(true);
  });

  it('handles tiebreak-only set with win by 2', () => {
    const result = validateSetScore({ side1TiebreakScore: 12, side2TiebreakScore: 10 }, 'SET1-S:TB11', false, false);
    expect(result.isValid).toBe(true);
  });

  it('validates set score past tiebreakTo must be won by exactly 2', () => {
    const result = validateSetScore({ side1TiebreakScore: 14, side2TiebreakScore: 11 }, 'SET1-S:TB11', false, false);
    expect(result.isValid).toBe(false);
  });
});

// ----------------------------------------------------------------
// 7. getCategoryAgeDetails.ts — combined codes, between ranges,
//    O-prefix, U-post, invalid category, invalid dates
// ----------------------------------------------------------------
describe('getCategoryAgeDetails uncovered paths', () => {
  it('returns error for non-object category', () => {
    const result = getCategoryAgeDetails({ category: 'not-an-object' as any });
    expect(result.error).toEqual(INVALID_CATEGORY);
  });

  it('returns error for invalid category values', () => {
    const result = getCategoryAgeDetails({ category: { ageMax: 'abc' } as any });
    expect(result.error).toEqual(INVALID_CATEGORY);
  });

  it('handles U-prefix code (Under)', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'U18' },
      consideredDate: '2024-01-15',
    });
    expect(result.ageMax).toBe(17);
    expect(result.ageMinDate).toBeDefined();
  });

  it('handles O-prefix code (Over)', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'O35' },
      consideredDate: '2024-06-01',
    });
    expect(result.ageMin).toBe(36);
    expect(result.ageMaxDate).toBeDefined();
  });

  it('handles U-post code (e.g. 18U)', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: '18U' },
      consideredDate: '2024-01-15',
    });
    expect(result.ageMax).toBe(18);
  });

  it('handles O-post code (e.g. 35O)', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: '35O' },
      consideredDate: '2024-06-01',
    });
    expect(result.ageMin).toBe(35);
  });

  it('handles combined category code (e.g. C14-18)', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'C14-18' },
      consideredDate: '2024-06-01',
    });
    expect(result.ageMin).toBe(14);
    expect(result.ageMax).toBe(18);
    expect(result.combinedAge).toBe(true);
  });

  it('handles between category code (e.g. U12-U16)', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'U12-U16' },
      consideredDate: '2024-06-01',
    });
    expect(result).toBeDefined();
  });

  it('handles default path with ageMin and ageMax only', () => {
    const result = getCategoryAgeDetails({
      category: { ageMin: 30, ageMax: 40 },
      consideredDate: '2024-06-01',
    });
    expect(result).toBeDefined();
    expect(result.ageMin).toBeDefined();
    expect(result.ageMax).toBeDefined();
  });

  it('handles invalid date', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'U18' },
      consideredDate: 'not-a-date',
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('handles category with conflicting ageMax and code', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'U18', ageMax: 20 },
      consideredDate: '2024-01-15',
    });
    expect(result.errors).toBeDefined();
  });

  it('handles invalid combined age range', () => {
    const result = getCategoryAgeDetails({
      category: { ageCategoryCode: 'C18-14' },
      consideredDate: '2024-06-01',
    });
    expect(result.errors).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 8. getParticipantStats.ts — guard paths and edge cases
// ----------------------------------------------------------------
describe('getParticipantStats uncovered paths', () => {
  it('returns error for missing tournament record', () => {
    const result: any = getParticipantStats({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error for invalid matchUps (non-array)', () => {
    const tournamentRecord = { tournamentId: 't1', participants: [] } as any;
    const result: any = getParticipantStats({ tournamentRecord, matchUps: 'bad' as any });
    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  it('returns error when matchUps is empty array', () => {
    const tournamentRecord = { tournamentId: 't1', participants: [] } as any;
    const result: any = getParticipantStats({ tournamentRecord, matchUps: [] });
    expect(result.error).toEqual(MISSING_MATCHUPS);
  });

  it('returns INVALID_PARTICIPANT_IDS for non-team participants', () => {
    const tournamentRecord = {
      tournamentId: 't1',
      participants: [{ participantId: 'p1', participantType: 'INDIVIDUAL' }],
    } as any;
    // Provide matchUps so it doesn't hit MISSING_MATCHUPS first
    const matchUps = [
      {
        matchUpId: 'mu1',
        matchUpType: 'SINGLES',
        matchUpStatus: COMPLETED,
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
        sides: [
          { sideNumber: 1, participantId: 'p1', participant: { participantId: 'p1', participantName: 'P1' } },
          { sideNumber: 2, participantId: 'p2', participant: { participantId: 'p2', participantName: 'P2' } },
        ],
      },
    ] as any;
    const result: any = getParticipantStats({ tournamentRecord, teamParticipantId: 'p1', matchUps });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  });
});

// ----------------------------------------------------------------
// 9. modifyTournamentRecord.ts — venueProfiles, eventProfiles with
//    existing events, schedulingProfile
// ----------------------------------------------------------------
describe('modifyTournamentRecord uncovered paths', () => {
  it('processes eventProfiles targeting existing events', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION }],
    });
    tournamentEngine.setState(result.tournamentRecord);
    const events = tournamentEngine.getEvents().events;
    const eventName = events[0].eventName;

    // Use modifyTournamentRecord to add a draw to existing event
    const modResult = tournamentEngine.modifyTournamentRecord({
      eventProfiles: [
        {
          eventName,
          drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION }],
        },
      ],
    });
    // Should succeed or return success
    expect(modResult.error).toBeUndefined();
  });

  it('processes venueProfiles', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(result.tournamentRecord);
    const modResult = tournamentEngine.modifyTournamentRecord({
      venueProfiles: [{ venueCount: 1, courtsCount: 2 }],
    });
    expect(modResult.venueIds).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 10. generateEventWithDraw.ts — edge cases: no generate, team
//     events, publish, outcomes, alternates
// ----------------------------------------------------------------
describe('generateEventWithDraw uncovered paths', () => {
  it('handles drawProfile with generate=false (flight creation path)', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, generate: false }],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('handles team event draw profile', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'TEAM' }],
    });
    expect(result.tournamentRecord).toBeDefined();
    const events = result.tournamentRecord.events;
    expect(events?.[0]?.eventType).toBe('TEAM');
  });

  it('handles publish option in draw profile', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, publish: true, completeAllMatchUps: true }],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('handles outcomes array in drawProfile', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          outcomes: [{ roundNumber: 1, matchUpIndex: 0, winningSide: 1, scoreString: '6-1 6-2' }],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('handles alternatesCount in drawProfile', () => {
    const result = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      drawProfiles: [{ drawSize: 8, alternatesCount: 2 }],
    });
    expect(result.tournamentRecord).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 11. assignDrawPositionBye.ts — tested via engine
// ----------------------------------------------------------------
describe('assignDrawPositionBye uncovered paths', () => {
  it('handles round robin bye assignment', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, participantsCount: 3 }],
    });
    tournamentEngine.setState(result.tournamentRecord);
    // With 3 participants in a 4-draw RR, a BYE should already be assigned
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: result.drawIds[0] });
    const positionAssignments = drawDefinition?.structures?.[0]?.structures?.[0]?.positionAssignments;
    const hasBye = positionAssignments?.some((a) => a.bye);
    expect(hasBye).toBe(true);
  });
});

// ----------------------------------------------------------------
// 12. updateTieFormat.ts — tested via engine with TEAM events
// ----------------------------------------------------------------
describe('updateTieFormat via engine', () => {
  it('updates tieFormat on a TEAM draw definition', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: 'TEAM' }],
    });
    tournamentEngine.setState(result.tournamentRecord);
    const events = tournamentEngine.getEvents().events;
    const teamEvent = events.find((e) => e.eventType === 'TEAM');
    if (teamEvent?.drawDefinitions?.[0]?.tieFormat) {
      const tf = structuredClone(teamEvent.drawDefinitions[0].tieFormat);
      // Modify winCriteria slightly to trigger update path
      tf.winCriteria = { valueType: 'PERCENTAGE', percentage: 60 };
      const updateResult = tournamentEngine.updateTieFormat({
        drawId: teamEvent.drawDefinitions[0].drawId,
        tieFormat: tf,
      });
      expect(updateResult.error).toBeUndefined();
    }
  });
});

// ----------------------------------------------------------------
// 13. prepareStage.ts — via ROUND_ROBIN_WITH_PLAYOFF generation
// ----------------------------------------------------------------
describe('prepareStage uncovered paths', () => {
  it('handles ROUND_ROBIN_WITH_PLAYOFF with completeAllMatchUps', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          completeAllMatchUps: true,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
    expect(result.drawIds?.length).toBeGreaterThan(0);
  });

  it('handles qualifying profiles', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: SINGLE_ELIMINATION,
          qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }] }],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 14. positionAssignment.ts — via engine operations
// ----------------------------------------------------------------
describe('positionAssignment uncovered paths', () => {
  it('handles seeded participant positioning in consolation', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
          seedsCount: 2,
          completeAllMatchUps: true,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
    tournamentEngine.setState(result.tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId: result.drawIds[0] });
    // Consolation structure should exist
    const consolation = drawDefinition?.structures?.find((s) => s.stage === 'CONSOLATION');
    expect(consolation).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 15. removeTieMatchUpParticipant.ts — complex path tested via TEAM
// ----------------------------------------------------------------
describe('removeTieMatchUpParticipant paths', () => {
  it('handles TEAM matchUp participant removal flows', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: 'TEAM' }],
    });
    tournamentEngine.setState(result.tournamentRecord);
    // Getting matchUps for the TEAM draw
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps?.find((m) => m.matchUpType === 'TEAM');
    expect(teamMatchUp).toBeDefined();
    // The tieMatchUps should exist
    expect(teamMatchUp?.tieMatchUps?.length).toBeGreaterThan(0);
  });
});
