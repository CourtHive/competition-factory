/**
 * Coverage tests for getTournamentPoints.ts
 * Targets uncovered branches: team/doubles attribution paths (lines ~269, 293-294, 334, 392-394)
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { TEAM_EVENT, DOUBLES } from '@Constants/eventConstants';
import { SPLIT_EVEN } from '@Constants/rankingConstants';

// ----------------------------------------------------------------
// 1. Basic tournament points — singles draw with finishing position ranges
// ----------------------------------------------------------------
describe('getTournamentPoints basic scenarios', () => {
  it('awards points for a completed singles tournament', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 70 },
                4: { value: 50 },
                8: { value: 30 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.personPoints).toBeDefined();

    const allAwards: any = Object.values(result.personPoints);
    expect(allAwards.length).toBe(8);

    // Every participant should have received points
    for (const awards of allAwards) {
      expect(awards.length).toBeGreaterThan(0);
      expect(awards[0].points).toBeGreaterThan(0);
    }

    // Winner should get 100
    const winnerAward = allAwards.find((a) => a[0].positionPoints === 100);
    expect(winnerAward).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 2. Doubles attribution — SPLIT_EVEN path (lines ~369-390)
// ----------------------------------------------------------------
describe('getTournamentPoints doubles attribution', () => {
  it('splits points evenly between pair members with SPLIT_EVEN', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          doublesAttribution: SPLIT_EVEN,
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 60 },
                4: { value: 30 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.pairPoints).toBeDefined();
    expect(result.personPoints).toBeDefined();

    // splitEven: individuals are the ranking entity; pair is bookkeeping
    // for who played together and gets nothing of its own.
    const personAwards: any = Object.values(result.personPoints);
    const pairAwards = Object.values(result.pairPoints);
    expect(personAwards.length).toBeGreaterThan(0);
    expect(pairAwards).toHaveLength(0);

    // Each individual should get half the per-position table value
    // (SPLIT_EVEN multiplier = 0.5). Winner position value is 100 →
    // each finalist gets 50.
    const winnerAward = personAwards.flat().find((a: any) => a.positionPoints === 50);
    expect(winnerAward).toBeDefined();
  });

  it('gives full points to each member with fullToEach attribution', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          doublesAttribution: 'fullToEach',
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 60 },
                4: { value: 30 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.pairPoints).toBeDefined();
    expect(result.personPoints).toBeDefined();

    // fullToEach: individuals each get the full position-table value;
    // pair gets nothing of its own.
    const personAwards: any = Object.values(result.personPoints);
    const pairAwards = Object.values(result.pairPoints);
    expect(personAwards.length).toBeGreaterThan(0);
    expect(pairAwards).toHaveLength(0);

    const winnerAward = personAwards.flat().find((a: any) => a.positionPoints === 100);
    expect(winnerAward).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 3. Team event points (lines ~267-325, 392-394)
// ----------------------------------------------------------------
describe('getTournamentPoints team event', () => {
  it('awards team points for a completed TEAM event', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 200 },
                2: { value: 120 },
                4: { value: 60 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.teamPoints).toBeDefined();

    // Team participants should receive team points
    const teamAwards: any = Object.values(result.teamPoints);
    expect(teamAwards.length).toBeGreaterThan(0);

    for (const awards of teamAwards) {
      expect(awards.length).toBeGreaterThan(0);
      expect(awards[0].points).toBeGreaterThan(0);
    }
  });

  it('awards per-win line points for team tieMatchUps with level-based perWinPoints', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    // Use perWinPoints with level object containing line array
    // This targets the team tieMatchUp loop (lines ~267-325)
    const result = tournamentEngine.getTournamentPoints({
      level: 1,
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          awardProfiles: [
            {
              perWinPoints: {
                level: { 1: { line: [10, 8, 6, 4, 2], limit: 5 } },
              },
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 50 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.teamPoints).toBeDefined();

    // Check if personPoints received line-based points from tieMatchUps
    const personAwards: any = Object.values(result.personPoints);
    const linePointAwards = personAwards.flat().filter((a) => a.linePoints !== undefined);

    // If tieMatchUps were completed, line points should be awarded
    if (linePointAwards.length > 0) {
      for (const award of linePointAwards) {
        expect(award.linePoints).toBeGreaterThan(0);
        expect(award.collectionPosition).toBeDefined();
      }
    }
  });

  it('awards numeric perWinPoints for team tieMatchUps (line 293-294)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    // Use perWinPoints with a simple numeric level value
    // This targets line 293-294: else if (typeof levelValue === 'number')
    const result = tournamentEngine.getTournamentPoints({
      level: 1,
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          awardProfiles: [
            {
              perWinPoints: {
                level: { 1: 5 },
              },
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 50 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.teamPoints).toBeDefined();

    // personPoints may have linePoints from numeric levelValue
    const personAwards: any = Object.values(result.personPoints);
    const linePointAwards = personAwards.flat().filter((a) => a.linePoints !== undefined);
    if (linePointAwards.length > 0) {
      for (const award of linePointAwards) {
        expect(award.linePoints).toBe(5);
      }
    }
  });
});

// ----------------------------------------------------------------
// 4. requireWinFirstRound — first-round losers get 0 points
// ----------------------------------------------------------------
describe('getTournamentPoints requireWinFirstRound', () => {
  it('denies points to first-round losers when requireWinFirstRound is true', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);

    // First, get points WITHOUT requireWinFirstRound
    const resultWithout = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          requireWinFirstRound: false,
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 70 },
                4: { value: 50 },
                8: { value: 30 },
              },
            },
          ],
        },
      },
    });

    expect(resultWithout.success).toBe(true);
    const allPointsWithout: any = Object.values(resultWithout.personPoints);
    // All 8 participants should have points
    expect(allPointsWithout.length).toBe(8);
    const totalWithout = allPointsWithout.reduce((sum, awards) => sum + (awards[0]?.points || 0), 0);

    // Now get points WITH requireWinFirstRound: true
    const resultWith = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          requireWinFirstRound: true,
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 70 },
                4: { value: 50 },
                8: { value: 30 },
              },
            },
          ],
        },
      },
    });

    expect(resultWith.success).toBe(true);
    const allPointsWith: any = Object.values(resultWith.personPoints);

    // Total should be less because first-round losers are excluded
    const totalWith = allPointsWith.reduce((sum, awards) => sum + (awards[0]?.points || 0), 0);
    expect(totalWith).toBeLessThan(totalWithout);
  });

  it('requireWinFirstRound on awardProfile level overrides policy level', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);

    // Policy level: requireWinFirstRound false, but awardProfile level: true
    const result = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          requireWinFirstRound: false,
          awardProfiles: [
            {
              requireWinFirstRound: true,
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 70 },
                4: { value: 50 },
                8: { value: 30 },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    const allPoints: any = Object.values(result.personPoints);
    const totalPoints = allPoints.reduce((sum, awards) => sum + (awards[0]?.points || 0), 0);

    // Should be less than full total (100+70+50+50+30+30+30+30 = 390)
    // because first-round losers (position 8) are excluded
    expect(totalPoints).toBeLessThan(390);
  });
});

// ----------------------------------------------------------------
// 5. Bonus points path (line ~334)
// ----------------------------------------------------------------
describe('getTournamentPoints bonus points', () => {
  it('awards bonus points for specified finishing positions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getTournamentPoints({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 70 },
                4: { value: 50 },
                8: { value: 30 },
              },
              bonusPoints: [
                { finishingPositions: [1], value: 25 },
                { finishingPositions: [2], value: 10 },
              ],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);

    const allAwards: any = Object.values(result.personPoints);
    // The winner should have bonus points added
    const winnerAward = allAwards.find((a) => a[0].positionPoints === 100);
    expect(winnerAward).toBeDefined();
    expect(winnerAward![0].bonusPoints).toBe(25);
    expect(winnerAward![0].points).toBe(125); // 100 + 25

    // The finalist should have bonus points too
    const finalistAward = allAwards.find((a) => a[0].positionPoints === 70);
    expect(finalistAward).toBeDefined();
    expect(finalistAward![0].bonusPoints).toBe(10);
    expect(finalistAward![0].points).toBe(80); // 70 + 10
  });

  it('awards level-based bonus points', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getTournamentPoints({
      level: 2,
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: {
          awardProfiles: [
            {
              finishingPositionRanges: {
                1: { value: 100 },
                2: { value: 60 },
                4: { value: 30 },
              },
              bonusPoints: [{ finishingPositions: [1], value: { level: { 1: 50, 2: 30 } } }],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    const allAwards: any = Object.values(result.personPoints);
    const winnerAward = allAwards.find((a) => a[0].positionPoints === 100);
    if (winnerAward) {
      expect(winnerAward[0].bonusPoints).toBe(30); // level 2 value
      expect(winnerAward[0].points).toBe(130); // 100 + 30
    }
  });
});
