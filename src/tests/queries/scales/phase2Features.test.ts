import { POLICY_RANKING_POINTS_USTA_JUNIOR } from '@Fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { DOUBLES } from '@Constants/eventConstants';
import {
  COMPASS,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

const policyDefinitions = POLICY_RANKING_POINTS_USTA_JUNIOR;

describe('maxCountableMatches', () => {
  it('caps per-win points for USTA L3-5 Round Robin (max 5 matches)', () => {
    // Round Robin L3-5 has maxCountableMatches: 5
    // A 4-player RR has max 3 matches, well within the cap
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 3 });
    expect(result.success).toEqual(true);

    // Winner should have 3 wins * 225 = 675
    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPerWin = Math.max(...allAwards.map((a: any) => a.perWinPoints));
    expect(maxPerWin).toEqual(675); // 3 wins * 225 per win at L3
  });

  it('applies maxCountableMatches with a simple per-win policy', () => {
    // Custom policy with a low cap
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            profileName: 'Capped RR',
            drawTypes: [ROUND_ROBIN],
            levels: [1],
            perWinPoints: { level: { 1: 100 } },
            maxCountableMatches: 2, // cap at 2 wins
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 1 });
    expect(result.success).toEqual(true);

    // Winner has 3 wins, but cap is 2 → 2 * 100 = 200
    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPerWin = Math.max(...allAwards.map((a: any) => a.perWinPoints));
    expect(maxPerWin).toEqual(200); // 2 wins * 100 (capped from 3)
  });

  it('supports level-keyed maxCountableMatches', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            profileName: 'Level-keyed cap',
            drawTypes: [ROUND_ROBIN],
            levels: [1, 2],
            perWinPoints: { level: { 1: 100, 2: 80 } },
            maxCountableMatches: { level: { 1: 3, 2: 2 } },
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    // At level 1, cap is 3 → 3 * 100 = 300
    let result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 1 });
    let allAwards = Object.values(result.personPoints).flat() as any[];
    let maxPerWin = Math.max(...allAwards.map((a: any) => a.perWinPoints));
    expect(maxPerWin).toEqual(300);

    // At level 2, cap is 2 → 2 * 80 = 160
    result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 2 });
    allAwards = Object.values(result.personPoints).flat() as any[];
    maxPerWin = Math.max(...allAwards.map((a: any) => a.perWinPoints));
    expect(maxPerWin).toEqual(160);
  });
});

describe('bonusPoints', () => {
  it('awards champion and finalist bonus for USTA L6-7 Round Robin', () => {
    // Round Robin L6-7 has bonusPoints:
    //   Champion (position 1): L6: 15, L7: 8
    //   Finalist (position 2): L6: 10, L7: 6
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 6 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const awardsWithBonus = allAwards.filter((a: any) => a.bonusPoints > 0);
    expect(awardsWithBonus.length).toBeGreaterThan(0);

    // Champion should have bonusPoints = 15 at L6
    const championBonus = Math.max(...awardsWithBonus.map((a: any) => a.bonusPoints));
    expect(championBonus).toEqual(15);
  });

  it('awards level-keyed bonus points', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            profileName: 'With Bonus',
            drawTypes: [SINGLE_ELIMINATION],
            levels: [1, 2],
            finishingPositionRanges: {
              1: { level: { 1: 1000, 2: 500 } },
              2: { level: { 1: 700, 2: 350 } },
              4: { level: { 1: 400, 2: 200 } },
              8: { level: { 1: 200, 2: 100 } },
            },
            bonusPoints: [
              { finishingPositions: [1], value: { level: { 1: 50, 2: 25 } } },
              { finishingPositions: [2], value: { level: { 1: 30, 2: 15 } } },
            ],
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 1 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];

    // Champion: 1000 position + 50 bonus = 1050
    const championAward = allAwards.find((a: any) => a.positionPoints === 1000);
    expect(championAward).toBeDefined();
    expect(championAward.bonusPoints).toEqual(50);
    expect(championAward.points).toEqual(1050);

    // Finalist: 700 position + 30 bonus = 730
    const finalistAward = allAwards.find((a: any) => a.positionPoints === 700);
    expect(finalistAward).toBeDefined();
    expect(finalistAward.bonusPoints).toEqual(30);
    expect(finalistAward.points).toEqual(730);
  });
});

describe('doublesAttribution', () => {
  it('fullToEach: attributes full points to each individual in a pair', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        doublesAttribution: 'fullToEach',
        awardProfiles: [
          {
            profileName: 'Doubles Elimination',
            drawTypes: [SINGLE_ELIMINATION],
            levels: [1],
            finishingPositionRanges: {
              1: 500,
              2: 350,
              4: 200,
              8: 100,
            },
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 1 });
    expect(result.success).toEqual(true);

    // With fullToEach, pair awards should also appear in personPoints
    const pairIds = Object.keys(result.pairPoints);
    expect(pairIds.length).toBeGreaterThan(0);

    // Individual person points should also have entries from doubles
    const personIds = Object.keys(result.personPoints);
    expect(personIds.length).toBeGreaterThan(0);

    // Each person in the winning pair should get the full champion points (500)
    const allPersonAwards = Object.values(result.personPoints).flat() as any[];
    const doublesAwards = allPersonAwards.filter((a: any) => a.doublesParticipantId);
    expect(doublesAwards.length).toBeGreaterThan(0);

    const maxDoublesPoints = Math.max(...doublesAwards.map((a: any) => a.points));
    expect(maxDoublesPoints).toEqual(500); // full points
  });

  it('splitEven: attributes half points to each individual in a pair', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        doublesAttribution: 'splitEven',
        awardProfiles: [
          {
            profileName: 'Doubles Elimination',
            drawTypes: [SINGLE_ELIMINATION],
            levels: [1],
            finishingPositionRanges: {
              1: 500,
              2: 350,
              4: 200,
              8: 100,
            },
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 1 });
    expect(result.success).toEqual(true);

    const allPersonAwards = Object.values(result.personPoints).flat() as any[];
    const doublesAwards = allPersonAwards.filter((a: any) => a.doublesParticipantId);
    expect(doublesAwards.length).toBeGreaterThan(0);

    const maxDoublesPoints = Math.max(...doublesAwards.map((a: any) => a.points));
    expect(maxDoublesPoints).toEqual(250); // half of 500
  });

  it('no doublesAttribution: pair points only go to pairPoints', () => {
    const customPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        // no doublesAttribution defined
        awardProfiles: [
          {
            profileName: 'Doubles Elimination',
            drawTypes: [SINGLE_ELIMINATION],
            levels: [1],
            finishingPositionRanges: {
              1: 500,
              2: 350,
              4: 200,
              8: 100,
            },
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: customPolicy, level: 1 });
    expect(result.success).toEqual(true);

    // Pair points should exist
    const pairIds = Object.keys(result.pairPoints);
    expect(pairIds.length).toBeGreaterThan(0);

    // Without doublesAttribution, no individual personPoints from doubles
    const allPersonAwards = Object.values(result.personPoints).flat() as any[];
    const doublesAwards = allPersonAwards.filter((a: any) => a.doublesParticipantId);
    expect(doublesAwards.length).toEqual(0);
  });
});

describe('PointAward context fields', () => {
  it('award contains category, drawType, level, startDate, endDate', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 3 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    expect(allAwards.length).toBeGreaterThan(0);

    const award = allAwards[0] as any;
    expect(award.drawType).toBeDefined();
    expect(award.level).toEqual(3);
    expect(award.startDate).toBeDefined();
    expect(award.endDate).toBeDefined();
    expect(award.drawId).toBeDefined();
    expect(award.eventType).toBeDefined();
    // bonusPoints field is always present (may be 0)
    expect(award.bonusPoints).toBeDefined();
  });
});
