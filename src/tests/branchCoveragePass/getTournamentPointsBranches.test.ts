import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import scaleEngine from '@Engines/scaleEngine';
import { expect, test } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { SINGLES, DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TEAM_ONLY } from '@Constants/rankingConstants';
import { RANKING } from '@Constants/scaleConstants';

const scoringPolicy = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

// ---------------------------------------------------------------------------
// calculateBonusPoints: object bonus WITHOUT a `.level` key
// hits `bonusValue.level ?? bonusValue` (line 31 right side) + resolved-is-number (line 32)
// ---------------------------------------------------------------------------
test('object bonusPoints value without a level key resolves via the bare object', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            finishingPositionRanges: { 1: { value: 100 }, 2: { value: 70 }, 4: { value: 50 }, 8: { value: 30 } },
            // no `.level` wrapper — the object itself is the level map
            bonusPoints: [{ finishingPositions: [1], value: { 1: 50, 2: 30 } }],
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const allAwards: any = Object.values(result.personPoints).flat();
  const winner = allAwards.find((a: any) => a.positionPoints === 100);
  expect(winner).toBeDefined();
  expect(winner.bonusPoints).toEqual(50);
});

// ---------------------------------------------------------------------------
// calculateBonusPoints: object bonus that resolves to a NON-number
// hits `if (typeof resolved === 'number')` false side (line 32)
// ---------------------------------------------------------------------------
test('object bonusPoints value resolving to a non-number leaves bonus at zero', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            finishingPositionRanges: { 1: { value: 100 }, 2: { value: 70 }, 4: { value: 50 }, 8: { value: 30 } },
            // level 1 resolves to a nested object → not a number → bonus stays 0
            bonusPoints: [{ finishingPositions: [1], value: { 1: { nested: true } } }],
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const allAwards: any = Object.values(result.personPoints).flat();
  const winner = allAwards.find((a: any) => a.positionPoints === 100);
  expect(winner).toBeDefined();
  expect(winner.bonusPoints).toEqual(0);
});

// ---------------------------------------------------------------------------
// resolveMaxCountable: object `maxCountableMatches` — both `.level` and bare-object forms
// hits lines 188-191
// ---------------------------------------------------------------------------
test('object maxCountableMatches (bare map) resolves per level', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            maxCountableMatches: { 1: 2 }, // bare object → mcm.level ?? mcm → mcm
            pointsPerWin: 10,
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const allAwards: any = Object.values(result.personPoints).flat();
  // champion won 3 matchUps but only 2 are countable → capped at 20
  const capped = allAwards.find((a: any) => a.perWinPoints === 20);
  expect(capped).toBeDefined();
});

test('object maxCountableMatches with a level wrapper resolves per level', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            maxCountableMatches: { level: { 1: 1 } }, // `.level` present
            pointsPerWin: 10,
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const allAwards: any = Object.values(result.personPoints).flat();
  const capped = allAwards.find((a: any) => a.perWinPoints === 10);
  expect(capped).toBeDefined();
});

// ---------------------------------------------------------------------------
// accumulatePerWinPoints: numeric levelValue path (lines 271-272)
// profile has ONLY perWinPoints → awardPoints is always 0 → per-win branch runs
// ---------------------------------------------------------------------------
test('numeric per-win level value awards per-win points', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [{ perWinPoints: { level: { 1: 5 } } }],
      },
    },
  });

  expect(result.success).toEqual(true);
  const allAwards: any = Object.values(result.personPoints).flat();
  const champion = allAwards.find((a: any) => a.perWinPoints === 15); // 3 wins * 5
  expect(champion).toBeDefined();
});

// ---------------------------------------------------------------------------
// accumulatePerWinPoints: `!levelValue && ppwProfile.value` fallback (lines 273-275)
// ---------------------------------------------------------------------------
test('per-win value fallback awards points when no level value resolves', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [{ perWinPoints: { value: 5 } }], // no level → falls back to value
      },
    },
  });

  expect(result.success).toEqual(true);
  const allAwards: any = Object.values(result.personPoints).flat();
  const champion = allAwards.find((a: any) => a.perWinPoints === 15); // 3 wins * 5
  expect(champion).toBeDefined();
});

// ---------------------------------------------------------------------------
// distributeAward PAIR branch → pairPoints when doublesAttribution === TEAM_ONLY
// hits lines 308-311
// ---------------------------------------------------------------------------
test('teamOnly doubles attribution routes the award to pairPoints', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        doublesAttribution: TEAM_ONLY,
        awardProfiles: [{ finishingPositionRanges: { 1: { value: 100 }, 2: { value: 60 }, 4: { value: 30 } } }],
      },
    },
  });

  expect(result.success).toEqual(true);
  const pairAwards: any = Object.values(result.pairPoints);
  expect(pairAwards.length).toBeGreaterThan(0);
  // individuals get nothing under teamOnly
  expect(Object.values(result.personPoints)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// distributeAward PAIR branch with NO doublesAttribution declared (legacy default)
// hits the `!doublesAttribution` side of line 308
// ---------------------------------------------------------------------------
test('doubles with no attribution declared defaults to pairPoints', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [{ finishingPositionRanges: { 1: { value: 100 }, 2: { value: 60 }, 4: { value: 30 } } }],
      },
    },
  });

  expect(result.success).toEqual(true);
  const pairAwards: any = Object.values(result.pairPoints);
  expect(pairAwards.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// TEAM event: perWinPoints as an ARRAY + numeric level line value + team position points
// hits lines 46, 61-82, 112-113, 332-333, 619-620
// ---------------------------------------------------------------------------
test('team event with array perWinPoints awards line points and team points', () => {
  mocksEngine.generateTournamentRecord({
    policyDefinitions: scoringPolicy,
    completeAllMatchUps: true,
    eventProfiles: [{ drawProfiles: [{ drawSize: 8 }], eventType: TEAM_EVENT }],
    setState: true,
  });

  let result: any = scaleEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            eventTypes: [TEAM_EVENT],
            perWinPoints: [{ participationOrders: [1, 2, 3, 4], level: { 1: 5 } }],
            finishingPositionRanges: { 1: { value: 200 }, 2: { value: 120 }, 4: { value: 60 }, 8: { value: 30 } },
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const teamAwards: any = Object.values(result.teamPoints);
  expect(teamAwards.length).toBeGreaterThan(0);

  // individuals receive numeric line points (5) from winning tieMatchUps
  const linePointAwards: any = Object.values(result.personPoints)
    .flat()
    .filter((a: any) => a.linePoints !== undefined);
  expect(linePointAwards.length).toBeGreaterThan(0);
  for (const award of linePointAwards) {
    expect(award.linePoints).toEqual(5);
    expect(award.collectionPosition).toBeGreaterThanOrEqual(1);
  }
});

// ---------------------------------------------------------------------------
// requireWinForPoints declared on the awardProfile (line 399)
// ---------------------------------------------------------------------------
test('requireWinForPoints on the awardProfile denies points to non-winners', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            requireWinForPoints: true,
            finishingPositionRanges: { 1: { value: 100 }, 2: { value: 70 }, 4: { value: 50 }, 8: { value: 30 } },
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  // first-round losers (position 8, zero wins) earn nothing when a win is required
  const allAwards: any = Object.values(result.personPoints).flat();
  const zeroWinAward = allAwards.find((a: any) => a.winCount === 0 && a.positionPoints > 0);
  expect(zeroWinAward).toBeUndefined();
});

// ---------------------------------------------------------------------------
// distributeAward person path re-used across two draws (line 296 already-exists side)
// ---------------------------------------------------------------------------
test('a person earning across two events appends to an existing personPoints entry', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
    eventProfiles: [
      { eventType: SINGLES, drawProfiles: [{ drawSize: 8 }] },
      { eventType: SINGLES, drawProfiles: [{ drawSize: 8 }] },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getTournamentPoints({
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          { finishingPositionRanges: { 1: { value: 100 }, 2: { value: 70 }, 4: { value: 50 }, 8: { value: 30 } } },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const multiAward = Object.values(result.personPoints).find((awards: any) => awards.length > 1);
  expect(multiAward).toBeDefined();
});

// ---------------------------------------------------------------------------
// quality-win points appended to a person's awards (lines 165, 170-173)
// ---------------------------------------------------------------------------
test('quality win points are appended to personPoints', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  participants.forEach((p: any, index: number) => {
    tournamentEngine.setParticipantScaleItem({
      participantId: p.participantId,
      scaleItem: {
        scaleName: 'TEST_RANKING',
        scaleType: RANKING,
        eventType: SINGLES,
        scaleValue: index + 1,
        scaleDate: '2025-01-01',
      },
    });
  });

  const { tournamentRecord: updated } = tournamentEngine.getTournament();
  scaleEngine.setState(updated);

  let result: any = scaleEngine.getTournamentPoints({
    level: 1,
    policyDefinitions: {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            finishingPositionRanges: {
              1: { level: { 1: 1000 } },
              2: { level: { 1: 700 } },
              4: { level: { 1: 400 } },
              8: { level: { 1: 200 } },
            },
          },
        ],
        qualityWinProfiles: [
          {
            rankingScaleName: 'TEST_RANKING',
            rankingSnapshot: 'latestAvailable',
            unrankedOpponentBehavior: 'noBonus',
            includeWalkovers: false,
            rankingRanges: [
              { rankRange: [1, 2], value: 200 },
              { rankRange: [3, 4], value: 150 },
              { rankRange: [5, 8], value: 100 },
            ],
          },
        ],
      },
    },
  });

  expect(result.success).toEqual(true);
  const qualityAwards: any = Object.values(result.personPoints)
    .flat()
    .filter((a: any) => a.qualityWinPoints);
  expect(qualityAwards.length).toBeGreaterThan(0);
});
