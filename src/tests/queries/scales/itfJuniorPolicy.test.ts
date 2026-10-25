import { POLICY_RANKING_POINTS_ITF_JUNIOR_2025 } from '@Fixtures/policies/POLICY_RANKING_POINTS_ITF_JUNIOR_2025';
import { POLICY_RANKING_POINTS_ITF_JUNIOR } from '@Fixtures/policies/POLICY_RANKING_POINTS_ITF_JUNIOR';
import { getParticipantPoints } from '@Query/scales/getParticipantPoints';
import { validateRankingPolicy } from './policyEncoding/validatePolicy';
import { generateRankingList } from '@Query/scales/generateRankingList';
import type { AggregationRules } from '@Types/rankingTypes';
import { mocksEngine, tournamentEngine } from '../../..';
import { defined } from '@Tests/helpers/defined';
import { describe, expect, it } from 'vitest';

// constants
import {
  MAIN,
  PLAYOFF,
  PLAY_OFF,
  QUALIFYING,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// Ground truth: the points tables of Regulation 31, 2025 and 2026 ITF World Tennis Tour Juniors Regulations.
// Columns W, F, SF, QF, R16, R32; a missing column awards nothing.
const SINGLES_TABLE: Record<number, number[]> = {
  1: [1000, 700, 490, 300, 180, 90], // Grand Slam & Youth Olympic Games
  4: [500, 350, 250, 150, 90, 45], // J500
  5: [300, 210, 140, 100, 60, 30], // J300
  6: [200, 140, 100, 60, 36, 18], // J200
  7: [100, 60, 36, 20, 10, 5], // J100
  8: [60, 36, 18, 10, 5], // J60
  9: [30, 18, 9, 5, 2], // J30
};
const DOUBLES_TABLE: Record<number, number[]> = {
  1: [750, 525, 367, 225, 135],
  4: [375, 262, 187, 112, 67],
  5: [225, 157, 105, 75, 45],
  6: [150, 105, 75, 45, 27],
  7: [75, 45, 27, 15, 7],
  8: [45, 27, 14, 7],
  9: [25, 13, 6, 3],
};
const JUNIOR_FINALS: Record<string, number[]> = {
  '2025': [1000, 700, 550, 490, 420, 360, 320, 260], // the 2025 Finals awarded the 2026 table (see the policy header)
  '2026': [1000, 700, 550, 490, 420, 360, 320, 260],
};
const ACCESSORS = [1, 2, 4, 8, 16, 32];

const POLICIES = [
  { year: '2025', version: '2025.02', policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR_2025 },
  { year: '2026', version: '2026.01', policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR },
];

function profileNamed(policyDefinitions: any, profileName: string) {
  const profile = policyDefinitions[POLICY_TYPE_RANKING_POINTS].awardProfiles.find(
    (p: any) => p.profileName === profileName,
  );
  return defined(profile, profileName);
}

// The value a profile's finishingPositionRanges gives an accessor at a level: a number, or a level-keyed object.
function tableValue(profile: any, accessor: number, level: number) {
  const value = profile.finishingPositionRanges[accessor];
  if (value === undefined) return undefined;
  return typeof value === 'number' ? value : value.level[level];
}

function eventPoints({
  policyDefinitions,
  eventId,
  level,
}: {
  policyDefinitions: any;
  eventId: string;
  level: number;
}) {
  const result: any = tournamentEngine.getEventRankingPoints({ policyDefinitions, eventId, level });
  expect(result.success).toEqual(true);
  return result.eventAwards as any[];
}

describe.each(POLICIES)('ITF Junior $year policy', ({ year, version, policyDefinitions }) => {
  const policy: any = policyDefinitions[POLICY_TYPE_RANKING_POINTS];

  it('validates against rankingPolicy.schema.json', () => {
    const { valid, errorsText } = validateRankingPolicy(policyDefinitions);
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('carries its year, version and date range', () => {
    expect(policy.policyName).toEqual(`ITF World Tennis Tour Juniors ${year}`);
    expect(policy.policyVersion).toEqual(version);
    expect(policy.validDateRange.startDate).toEqual(`${year}-01-01`);
  });

  it('counts the six best singles and a quarter of the six best doubles (Reg. 10)', () => {
    const [singles, doubles] = defined(policy.aggregationRules.countingBuckets, 'countingBuckets') as any[];
    expect(singles).toMatchObject({ eventTypes: [SINGLES], bestOfCount: 6 });
    expect(singles.weight).toBeUndefined();
    expect(doubles).toMatchObject({ eventTypes: [DOUBLES], bestOfCount: 6, weight: 0.25 });
    expect(policy.aggregationRules.rollingPeriodDays).toEqual(364);
  });

  it('counts only the best edition of a J100-or-higher tournament, in each bucket (Reg. 10)', () => {
    const buckets = defined(policy.aggregationRules.countingBuckets, 'countingBuckets') as any[];
    for (const bucket of buckets) expect(bucket.bestPerSeries).toEqual({ levels: [1, 4, 5, 6, 7] });

    // two J300 editions of one series: the better counts; two J60 editions: both count (J60 is below J100)
    const pointAwards = [
      {
        personId: 'p',
        eventType: SINGLES,
        level: 5,
        positionPoints: 300,
        tournamentSeriesId: 'MEX',
        endDate: '2026-06-01',
      },
      {
        personId: 'p',
        eventType: SINGLES,
        level: 5,
        positionPoints: 140,
        tournamentSeriesId: 'MEX',
        endDate: '2025-07-01',
      },
      {
        personId: 'p',
        eventType: SINGLES,
        level: 8,
        positionPoints: 60,
        tournamentSeriesId: 'ISR',
        endDate: '2026-05-01',
      },
      {
        personId: 'p',
        eventType: SINGLES,
        level: 8,
        positionPoints: 36,
        tournamentSeriesId: 'ISR',
        endDate: '2025-08-01',
      },
    ];
    const [entry] = generateRankingList({
      pointAwards,
      aggregationRules: policy.aggregationRules,
      asOfDate: '2026-06-30',
    });
    expect(entry.totalPoints).toEqual(300 + 60 + 36);
  });

  it('encodes the Reg. 31 singles and doubles tables exactly', () => {
    const grandSlamSingles = profileNamed(policyDefinitions, 'Grand Slam Singles');
    const grandSlamDoubles = profileNamed(policyDefinitions, 'Grand Slam Doubles');
    const standardSingles = profileNamed(policyDefinitions, 'Standard Singles');
    const standardDoubles = profileNamed(policyDefinitions, 'Standard Doubles');

    for (const [levelKey, row] of Object.entries(SINGLES_TABLE)) {
      const level = Number(levelKey);
      const profile = level === 1 ? grandSlamSingles : standardSingles;
      expect(ACCESSORS.map((accessor) => tableValue(profile, accessor, level))).toEqual(
        ACCESSORS.map((_, i) => row[i]),
      );
    }
    for (const [levelKey, row] of Object.entries(DOUBLES_TABLE)) {
      const level = Number(levelKey);
      const profile = level === 1 ? grandSlamDoubles : standardDoubles;
      expect(ACCESSORS.map((accessor) => tableValue(profile, accessor, level))).toEqual(
        ACCESSORS.map((_, i) => row[i]),
      );
    }
  });

  it('encodes the ITF Junior Finals places 1–8 and Grand Slam qualifying', () => {
    const finals = profileNamed(policyDefinitions, 'ITF Junior Finals Singles');
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((place) => finals.finishingPositionRanges[place])).toEqual(JUNIOR_FINALS[year]);
    const qualifying = profileNamed(policyDefinitions, 'Grand Slam Qualifying Singles');
    expect(qualifying.finishingPositionRanges).toEqual({ 1: 30, 2: 20 });
  });

  it('awards no points at any level the regulations do not grade', () => {
    const levels = policy.awardProfiles.flatMap((p: any) => p.levels);
    expect(levels).not.toContain(3);
    expect(Math.max(...levels)).toEqual(9);
  });
});

describe('ITF Junior points from a played draw', () => {
  it('scores a J500 singles draw from the table, and a first-round loser gets nothing (Reg. 31a)', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32, eventType: SINGLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const awards = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR, eventId, level: 4 });
    const points = awards.map((a) => a.positionPoints).sort((a, b) => b - a);
    // W, F, 2 SF, 4 QF, 8 R16; the 16 R32 losers never won a round, so the 45 the table lists is not awarded
    expect(points).toEqual([500, 350, 250, 250, ...Array(4).fill(150), ...Array(8).fill(90)]);
  });

  it('scores a J500 doubles draw from the doubles table, in full on each partner', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 16, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const awards = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR, eventId, level: 4 });
    const points = awards.map((a) => a.positionPoints).sort((a, b) => b - a);
    // one award per partner: 2 W, 2 F, 4 SF, 8 QF; R16 losers never won a round
    expect(points).toEqual([375, 375, 262, 262, ...Array(4).fill(187), ...Array(8).fill(112)]);
  });

  it('gives a Grand Slam qualifier 30 only when they lose in the first round of the main draw', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          eventType: SINGLES,
          drawType: SINGLE_ELIMINATION,
          qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });
    const qualifierIds = placeQualifiers(drawId);
    expect(qualifierIds.length).toEqual(4);

    // the first qualifier wins their first main draw match, the other three lose theirs
    const [winner, ...losers] = qualifierIds;
    completeMainDraw(drawId, winner);

    const awards = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR, eventId, level: 1 });
    const pointsOf = (participantId: string) =>
      defined(
        awards.find((a) => a.participantId === participantId),
        `award for ${participantId}`,
      ).positionPoints;

    // a loss in the first main draw round keeps the qualifier's 30; a win is scored by the main draw table alone,
    // never 30 on top of it
    for (const participantId of losers) expect(pointsOf(participantId)).toEqual(30);
    expect([1000, 700, 490, 300]).toContain(pointsOf(winner));

    // the losers in the final (only) round of qualifying get 20
    expect(awards.filter((a) => a.positionPoints === 20).length).toEqual(4);
  });

  it.each([
    ['2025', POLICY_RANKING_POINTS_ITF_JUNIOR_2025],
    ['2026', POLICY_RANKING_POINTS_ITF_JUNIOR],
  ])('scores the %s ITF Junior Finals by playoff place', (year, policyDefinitions) => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          eventType: SINGLES,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          structureOptions: {
            groupSize: 4,
            playoffGroups: [
              { finishingPositions: [1, 2], structureName: 'Places 1-4', drawType: PLAYOFF },
              { finishingPositions: [3, 4], structureName: 'Places 5-8', drawType: PLAYOFF },
            ],
          },
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const awards = eventPoints({ policyDefinitions, eventId, level: 2 });
    const points = awards.map((a) => a.positionPoints).sort((a, b) => b - a);
    // every place 1–8, including the matches for 3rd and 7th (the playoffs' second round)
    expect(points).toEqual(JUNIOR_FINALS[year]);
  });

  it('scores the 2026 J60 Round Robin to Elimination by playoff and group place; 2025 has no such table', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 32,
          eventType: SINGLES,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          structureOptions: { groupSize: 4, playoffGroups: [{ finishingPositions: [1], structureName: 'Playoff' }] },
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const awards2026 = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR, eventId, level: 8 });
    const pointsOf = (participantId: string) =>
      awards2026.find((a) => a.participantId === participantId)?.positionPoints ?? 0;

    // the eight group winners play off from the quarterfinals
    const groups = groupPlaces(drawId);
    expect(groups.length).toEqual(32);
    const winners = groups.filter((g) => g.groupOrder === 1);
    expect(winners.map((g) => pointsOf(g.participantId)).sort((a, b) => b - a)).toEqual([
      60, 36, 18, 18, 10, 10, 10, 10,
    ]);

    // 2nd place earns 5; 3rd and 4th earn 2 only with a match won
    for (const { participantId, groupOrder, winCount } of groups.filter((g) => g.groupOrder > 1)) {
      const expected = groupOrder === 2 ? 5 : (winCount && 2) || 0;
      expect(pointsOf(participantId)).toEqual(expected);
    }
    // the draw exercises both sides of the match-won condition
    const thirdOrFourth = groups.filter((g) => g.groupOrder > 2);
    expect(thirdOrFourth.some((g) => g.winCount)).toEqual(true);
    expect(thirdOrFourth.some((g) => !g.winCount)).toEqual(true);

    // 2025 has no Round Robin to Elimination table: the elimination table cannot read a group place
    const awards2025 = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR_2025, eventId, level: 8 });
    expect(awards2025.some((a) => a.positionPoints === 60)).toEqual(false);
  });
});

describe('ITF Junior 2026 J60: a Lucky Loser Round Robin (Reg. 44 g)', () => {
  const withoutRule = (() => {
    const policy: any = structuredClone(POLICY_RANKING_POINTS_ITF_JUNIOR);
    for (const profile of policy[POLICY_TYPE_RANKING_POINTS].awardProfiles) delete profile.luckyLoserRoundRobin;
    return policy;
  })();

  it('loses the quarterfinal: earns 2nd place points (5), not quarterfinal points (10)', () => {
    const { eventId, luckyLoserId } = drawWithLuckyLoser({ luckyLoserWinsQuarterfinal: false });
    const pointsOf = (policyDefinitions: any) =>
      eventPoints({ policyDefinitions, eventId, level: 8 }).find((a) => a.participantId === luckyLoserId)
        ?.positionPoints;

    expect(pointsOf(POLICY_RANKING_POINTS_ITF_JUNIOR)).toEqual(5);
    // the contrast: without the rule the quarterfinal loss would score
    expect(pointsOf(withoutRule)).toEqual(10);
  });

  it('wins the quarterfinal: earns semifinal points or better', () => {
    const { eventId, luckyLoserId } = drawWithLuckyLoser({ luckyLoserWinsQuarterfinal: true });
    const award = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR, eventId, level: 8 }).find(
      (a) => a.participantId === luckyLoserId,
    );
    expect([60, 36, 18]).toContain(award?.positionPoints);
  });
});

describe('ITF Junior combined ranking: doubles count at a quarter', () => {
  const aggregationRules = POLICY_RANKING_POINTS_ITF_JUNIOR[POLICY_TYPE_RANKING_POINTS].aggregationRules;

  function award(eventType: string, positionPoints: number, endDate = '2026-06-01') {
    return { personId: 'p1', eventType, positionPoints, points: positionPoints, level: 4, endDate };
  }

  // 7 singles and 7 doubles results: the best 6 of each count
  const pointAwards = [
    ...[500, 350, 250, 150, 90, 45, 30].map((p) => award(SINGLES, p)),
    ...[375, 262, 187, 112, 67, 45, 27].map((p) => award(DOUBLES, p)),
  ];
  const singlesBest6 = 500 + 350 + 250 + 150 + 90 + 45;
  const doublesBest6 = 375 + 262 + 187 + 112 + 67 + 45;

  it('generateRankingList totals the singles plus a quarter of the doubles', () => {
    const [entry] = generateRankingList({ pointAwards, aggregationRules, asOfDate: '2026-07-01' });
    expect(entry.totalPoints).toEqual(singlesBest6 + doublesBest6 / 4);
    expect(entry.bucketTotals).toEqual({ Singles: singlesBest6, Doubles: doublesBest6 / 4 });

    // the awards keep their table points; only the bucket total is weighted
    const doubles = defined(entry.bucketBreakdown, 'bucketBreakdown')[1];
    expect(doubles.countingResults.map((a) => a.positionPoints)).toEqual([375, 262, 187, 112, 67, 45]);
    expect(doubles.droppedResults.map((a) => a.positionPoints)).toEqual([27]);
  });

  it('getParticipantPoints reports the same weighted total', () => {
    const { totalPoints, buckets } = getParticipantPoints({ pointAwards, personId: 'p1', aggregationRules });
    expect(totalPoints).toEqual(singlesBest6 + doublesBest6 / 4);
    expect(buckets.map((b) => b.bucketTotal)).toEqual([singlesBest6, doublesBest6 / 4]);
  });

  it('without the weight, doubles would count in full', () => {
    const unweighted = {
      ...aggregationRules,
      countingBuckets: defined(aggregationRules.countingBuckets, 'countingBuckets').map(
        ({ weight: _weight, ...bucket }) => bucket,
      ),
    };
    const [entry] = generateRankingList({ pointAwards, aggregationRules: unweighted, asOfDate: '2026-07-01' });
    expect(entry.totalPoints).toEqual(singlesBest6 + doublesBest6);
  });

  it('applies the weight to a bucket with mandatory rules too', () => {
    const rules: AggregationRules = {
      countingBuckets: [
        {
          bucketName: 'Doubles',
          eventTypes: [DOUBLES],
          bestOfCount: 2,
          weight: 0.25,
          pointComponents: ['positionPoints'],
          mandatoryRules: [{ ruleName: 'J500', levels: [4] }],
        },
      ],
    };
    const [entry] = generateRankingList({ pointAwards, aggregationRules: rules, asOfDate: '2026-07-01' });
    // every doubles award is level 4, so all seven are mandatory and count
    expect(entry.totalPoints).toEqual((doublesBest6 + 27) / 4);
  });
});

describe('ITF Junior ties: the Reg. 11 countback', () => {
  const aggregationRules = POLICY_RANKING_POINTS_ITF_JUNIOR[POLICY_TYPE_RANKING_POINTS].aggregationRules;
  const asOfDate = '2026-07-01';

  function award(personId: string, eventType: string, level: number, points: number) {
    return { personId, eventType, level, points, positionPoints: points, endDate: '2026-06-01' };
  }
  function ranks(pointAwards: any[], rules: AggregationRules = aggregationRules) {
    const entries = generateRankingList({ pointAwards, aggregationRules: rules, asOfDate });
    return Object.fromEntries(entries.map((e) => [e.personId, { rank: e.rank, total: e.totalPoints }]));
  }

  it('encodes Grand Slam then each grade from J500 down, singles before doubles', () => {
    expect(aggregationRules.tiebreakCriteria).toEqual([
      { levelPoints: [1, 4, 5, 6, 7, 8, 9], eventTypes: [SINGLES] },
      { levelPoints: [1, 4, 5, 6, 7, 8, 9], eventTypes: [DOUBLES] },
    ]);
  });

  it('separates a tie by Grand Slam singles points first', () => {
    // both 600: a Grand Slam quarterfinal and a J300 title, against a J500 title and a J100 title
    const pointAwards = [
      award('b', SINGLES, 4, 500),
      award('b', SINGLES, 7, 100),
      award('a', SINGLES, 1, 300),
      award('a', SINGLES, 5, 300),
    ];
    expect(ranks(pointAwards)).toEqual({ a: { rank: 1, total: 600 }, b: { rank: 2, total: 600 } });

    // without the countback the two share the rank
    const untied = { ...aggregationRules, tiebreakCriteria: [] };
    expect(ranks(pointAwards, untied)).toEqual({ a: { rank: 1, total: 600 }, b: { rank: 1, total: 600 } });
  });

  it('then by singles points grade by grade, the higher grade first', () => {
    // no Grand Slam points; equal totals; 'a' has more J500 points, though 'b' has more J300 points
    const pointAwards = [
      award('b', SINGLES, 5, 300),
      award('b', SINGLES, 9, 50),
      award('a', SINGLES, 4, 250),
      award('a', SINGLES, 6, 100),
    ];
    expect(ranks(pointAwards)).toEqual({ a: { rank: 1, total: 350 }, b: { rank: 2, total: 350 } });
  });

  it('then by doubles, once every singles level is equal', () => {
    const pointAwards = [
      award('a', SINGLES, 4, 250),
      award('b', SINGLES, 4, 250),
      award('b', DOUBLES, 4, 100),
      award('a', DOUBLES, 1, 100),
    ];
    // each total is 250 + 100 / 4; the Grand Slam doubles result decides
    expect(ranks(pointAwards)).toEqual({ a: { rank: 1, total: 275 }, b: { rank: 2, total: 275 } });
  });

  it('leaves a tie the countback cannot separate as a shared rank', () => {
    const pointAwards = [award('a', SINGLES, 4, 250), award('b', SINGLES, 4, 250)];
    expect(ranks(pointAwards)).toEqual({ a: { rank: 1, total: 250 }, b: { rank: 1, total: 250 } });
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

// mocksEngine completes qualifying but leaves the qualifiers' main draw seats empty: place each winner of the
// final qualifying round in a qualifier seat. Returns the qualifiers in seat order.
function placeQualifiers(drawId: string): string[] {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = (stage: string) =>
    defined(
      drawDefinition.structures.find((s: any) => s.stage === stage),
      `${stage} structure`,
    );
  const main = structure(MAIN);
  const qualifying = structure(QUALIFYING);
  const seats = main.positionAssignments.filter((a: any) => a.qualifier).map((a: any) => a.drawPosition);
  const qualifierIds = drawMatchUps(drawId)
    .filter((m: any) => m.structureId === qualifying.structureId && m.finishingRound === 1)
    .map((m: any) => m.sides.find((side: any) => side.sideNumber === m.winningSide).participantId);
  expect(qualifierIds.length).toEqual(seats.length);
  qualifierIds.forEach((qualifyingParticipantId: string, i: number) => {
    const result: any = tournamentEngine.qualifierDrawPositionAssignment({
      structureId: main.structureId,
      drawPosition: seats[i],
      qualifyingParticipantId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
  return qualifierIds;
}

// Score every unplayed main draw matchUp. A qualifier wins their first match only if they are `qualifierToWin`;
// every other matchUp goes to side 1.
function completeMainDraw(drawId: string, qualifierToWin: string) {
  const mainMatchUps = () => drawMatchUps(drawId).filter((m: any) => m.stage === MAIN);
  const qualifierIds = new Set(qualifierParticipantIds(drawId));
  for (let pass = 0; pass < 8; pass++) {
    const ready = mainMatchUps().filter((m: any) => !m.winningSide && m.readyToScore);
    if (!ready.length) break;
    for (const matchUp of ready) {
      const qualifierSide = matchUp.sides.find((side: any) => qualifierIds.has(side.participantId));
      let winningSide = 1;
      if (qualifierSide && matchUp.roundNumber === 1) {
        const qualifierWins = qualifierSide.participantId === qualifierToWin;
        winningSide = qualifierWins ? qualifierSide.sideNumber : 3 - qualifierSide.sideNumber;
      }
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide });
      const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId, outcome });
      expect(result.success).toEqual(true);
    }
  }
  expect(mainMatchUps().every((m: any) => m.winningSide)).toEqual(true);
}

// A qualifier is a participant with matchUps in both the qualifying and the main structure.
function qualifierParticipantIds(drawId: string): string[] {
  const matchUps = drawMatchUps(drawId);
  const ids = (stage: string) =>
    new Set(
      matchUps
        .filter((m: any) => m.stage === stage)
        .flatMap((m: any) => (m.sides ?? []).map((side: any) => side.participantId))
        .filter(Boolean),
    );
  const main = ids(MAIN);
  return [...ids(QUALIFYING)].filter((participantId) => main.has(participantId));
}

function drawMatchUps(drawId: string): any[] {
  return defined(tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps, 'matchUps');
}

// Each participant's place in their round robin group, and the matches they won there.
function groupPlaces(drawId: string): { participantId: string; groupOrder: number; winCount: number }[] {
  const { participants } = tournamentEngine.getParticipants({ withRankingProfile: true });
  return (participants ?? []).flatMap((participant: any) => {
    const draw = participant.draws?.find((d: any) => d.drawId === drawId);
    const group = draw?.structureParticipation?.find((s: any) => s.groupOrder);
    if (!group) return [];
    return [{ participantId: participant.participantId, groupOrder: group.groupOrder, winCount: group.winCount }];
  });
}

// A 2026 J60 round robin to elimination: 32 players in groups of four, the group winners into a quarterfinal
// playoff. A group runner-up replaces the winner in the first playoff place as a Lucky Loser Round Robin, then the
// playoff is played with that player winning or losing the quarterfinal.
function drawWithLuckyLoser({ luckyLoserWinsQuarterfinal }: { luckyLoserWinsQuarterfinal: boolean }) {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        eventType: SINGLES,
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        structureOptions: { groupSize: 4, playoffGroups: [{ finishingPositions: [1], structureName: 'Playoff' }] },
      },
    ],
    setState: true,
  });
  const scoreWith = (matchUpId: string, winningSide: number) => {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide });
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
    expect(result.success).toEqual(true);
  };

  for (const matchUp of drawMatchUps(drawId).filter((m) => m.stage !== PLAY_OFF)) scoreWith(matchUp.matchUpId, 1);

  const structures = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;
  const groups = defined(
    structures.find((s: any) => s.stage !== PLAY_OFF),
    'round robin',
  );
  const playoff = defined(
    structures.find((s: any) => s.stage === PLAY_OFF),
    'playoff',
  );
  let result: any = tournamentEngine.automatedPlayoffPositioning({ drawId, structureId: groups.structureId });
  expect(result.success).toEqual(true);

  const luckyLoserId = defined(
    groupPlaces(drawId).find((g) => g.groupOrder === 2),
    'a group runner-up',
  ).participantId;
  const playoffSeat = { drawId, structureId: playoff.structureId, drawPosition: 1 };
  result = tournamentEngine.removeDrawPositionAssignment(playoffSeat);
  expect(result.success).toEqual(true);
  result = tournamentEngine.luckyLoserDrawPositionAssignment({ ...playoffSeat, luckyLoserParticipantId: luckyLoserId });
  expect(result.success).toEqual(true);

  for (let pass = 0; pass < 4; pass++) {
    const ready = drawMatchUps(drawId).filter((m) => m.stage === PLAY_OFF && !m.winningSide && m.readyToScore);
    for (const matchUp of ready) {
      const luckyLoserSide = matchUp.sides.find((side: any) => side.participantId === luckyLoserId)?.sideNumber;
      if (!luckyLoserSide) scoreWith(matchUp.matchUpId, 1);
      else scoreWith(matchUp.matchUpId, luckyLoserWinsQuarterfinal ? luckyLoserSide : 3 - luckyLoserSide);
    }
  }
  expect(drawMatchUps(drawId).every((m) => m.winningSide)).toEqual(true);

  return { eventId, luckyLoserId };
}
