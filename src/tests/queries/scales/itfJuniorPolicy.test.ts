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
  '2025': [850, 600, 480, 420, 370, 320, 280, 240],
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
    const [first, second, , fourth, fifth, sixth, , eighth] = JUNIOR_FINALS[year];
    // The 3rd/4th and 7th/8th place matches are not read (the engine takes a place from the first playoff round),
    // so both players in each score as 4th and as 8th: a known gap, recorded in the policy header.
    expect(points).toEqual([first, second, fourth, fourth, fifth, sixth, eighth, eighth]);
  });

  it('scores the 2026 J60 Round Robin to Elimination playoff, and the 2025 policy has no such table', () => {
    const {
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
    const points = awards2026.map((a) => a.positionPoints).sort((a, b) => b - a);
    // the eight group winners play off from the quarterfinals; round robin places are not encoded
    expect(points).toEqual([60, 36, 18, 18, 10, 10, 10, 10]);

    // 2025 has no Round Robin to Elimination table: the elimination table cannot read a group place
    const awards2025 = eventPoints({ policyDefinitions: POLICY_RANKING_POINTS_ITF_JUNIOR_2025, eventId, level: 8 });
    expect(awards2025.some((a) => a.positionPoints === 60)).toEqual(false);
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
