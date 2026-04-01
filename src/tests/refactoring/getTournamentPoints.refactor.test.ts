/**
 * Regression tests for getTournamentPoints refactoring.
 *
 * Tests the full points calculation pipeline to verify that
 * extracting sub-functions doesn't change results.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { MISSING_POLICY_DEFINITION } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/eventConstants';
import { CURTIS_CONSOLATION, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const basicAwardProfiles = [
  {
    eventTypes: [SINGLES],
    drawTypes: [],
    finishingPositionRanges: {
      1: { value: 100 },
      2: { value: 80 },
      4: { value: 60 },
      8: { value: 40 },
      16: { value: 20 },
    },
    pointsPerWin: 10,
  },
];

const basicPolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    requireWinForPoints: false,
    awardProfiles: basicAwardProfiles,
  },
};

// ─── Scenario 1: Fails without policy ─────────────────────────────────────
it('getTournamentPoints: fails without ranking points policy', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  let result: any = tournamentEngine.getTournamentPoints({});
  expect(result.error).toEqual(MISSING_POLICY_DEFINITION);
});

// ─── Scenario 2: Position points for single elimination ───────────────────
it('getTournamentPoints: position points for SE draw', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  let result: any = tournamentEngine.getTournamentPoints({ policyDefinitions: basicPolicy });
  expect(result.success).toEqual(true);
  expect(result.personPoints).toBeDefined();

  // Check that points were awarded
  const allPoints = Object.values(result.personPoints) as any[];
  expect(allPoints.length).toBeGreaterThan(0);

  // Winner should get 100 points
  const winnerAwards = allPoints.find((awards: any[]) => awards.some((a) => a.positionPoints === 100));
  expect(winnerAwards).toBeDefined();

  // Runner-up should get 80 points
  const runnerUpAwards = allPoints.find((awards: any[]) => awards.some((a) => a.positionPoints === 80));
  expect(runnerUpAwards).toBeDefined();
});

// ─── Scenario 3: Points per win ───────────────────────────────────────────
it('getTournamentPoints: per-win points accumulated correctly', () => {
  const perWinOnlyPolicy = {
    [POLICY_TYPE_RANKING_POINTS]: {
      requireWinForPoints: false,
      awardProfiles: [
        {
          eventTypes: [SINGLES],
          drawTypes: [],
          pointsPerWin: 25,
        },
      ],
    },
  };

  const drawProfiles = [{ drawSize: 8 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  let result: any = tournamentEngine.getTournamentPoints({ policyDefinitions: perWinOnlyPolicy });
  expect(result.success).toEqual(true);

  const allPoints = Object.values(result.personPoints) as any[];
  // Winner of 8 draw has 3 wins → 75 per-win points
  const winnerAwards = allPoints.find((awards: any[]) => awards.some((a) => a.perWinPoints === 75));
  expect(winnerAwards).toBeDefined();
});

// ─── Scenario 4: Return shape stability ───────────────────────────────────
it('getTournamentPoints: return shape includes all expected keys', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  let result: any = tournamentEngine.getTournamentPoints({ policyDefinitions: basicPolicy });
  expect(result.success).toEqual(true);
  expect(result.personPoints).toBeDefined();
  expect(result.pairPoints).toBeDefined();
  expect(result.teamPoints).toBeDefined();
  expect(result.participantsWithOutcomes).toBeDefined();
  expect(Array.isArray(result.participantsWithOutcomes)).toBe(true);
});

// ─── Scenario 5: Curtis consolation draw type matching ────────────────────
it('getTournamentPoints: award profiles match specific draw types', () => {
  const curtisPolicy = {
    [POLICY_TYPE_RANKING_POINTS]: {
      requireWinForPoints: false,
      awardProfiles: [
        {
          eventTypes: [SINGLES],
          drawTypes: [CURTIS_CONSOLATION],
          finishingPositionRanges: {
            1: { value: 500 },
            2: { value: 300 },
            4: { value: 200 },
          },
        },
      ],
    },
  };

  // SE draw — should not match Curtis consolation profile
  const drawProfiles = [{ drawSize: 8 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  let result: any = tournamentEngine.getTournamentPoints({ policyDefinitions: curtisPolicy });
  expect(result.success).toEqual(true);

  // No points should be awarded since draw type doesn't match
  const allPoints = Object.values(result.personPoints) as any[];
  const hasPositionPoints = allPoints.some((awards: any[]) => awards.some((a) => a.positionPoints > 0));
  expect(hasPositionPoints).toBe(false);
});
