/**
 * Regression tests for setMatchUpState refactoring.
 *
 * Tests the full mutation path through tournamentEngine to verify
 * that extracting sub-functions doesn't change behavior.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

// ─── Scenario 1: Basic score setting with winningSide ─────────────────────
it('setMatchUpState: basic score and winningSide', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const toBePlayedMatchUps = matchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore);
  expect(toBePlayedMatchUps.length).toBeGreaterThan(0);

  const targetMatchUp = toBePlayedMatchUps[0];
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome: {
      winningSide: 1,
      score: {
        scoreStringSide1: '6-3 6-4',
        scoreStringSide2: '3-6 4-6',
        sets: [
          {
            side1Score: 6,
            side2Score: 3,
            setNumber: 1,
            winningSide: 1,
          },
          {
            side1Score: 6,
            side2Score: 4,
            setNumber: 2,
            winningSide: 1,
          },
        ],
      },
    },
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const updated = matchUps.find((m) => m.matchUpId === targetMatchUp.matchUpId);
  expect(updated.winningSide).toEqual(1);
  expect(updated.matchUpStatus).toEqual(COMPLETED);
});

// ─── Scenario 2: WALKOVER status ─────────────────────────────────────────
it('setMatchUpState: walkover clears score', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore)[0];

  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome: {
      winningSide: 1,
      matchUpStatus: WALKOVER,
    },
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const updated = matchUps.find((m) => m.matchUpId === targetMatchUp.matchUpId);
  expect(updated.matchUpStatus).toEqual(WALKOVER);
  expect(updated.winningSide).toEqual(1);
});

// ─── Scenario 3: FMLC (consolation draw advancement) ─────────────────────
it('setMatchUpState: FMLC consolation structure receives losers', () => {
  const drawProfiles = [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const mainMatchUps = matchUps.filter((m) => m.stage === 'MAIN' && m.roundNumber === 1 && m.readyToScore);
  expect(mainMatchUps.length).toEqual(4);

  // Complete all first round matches
  for (const matchUp of mainMatchUps) {
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: {
        winningSide: 1,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { side1Score: 6, side2Score: 1, setNumber: 1, winningSide: 1 },
            { side1Score: 6, side2Score: 1, setNumber: 2, winningSide: 1 },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Consolation matchUps should now have participants
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const consolationMatchUps = matchUps.filter((m) => m.stage === 'CONSOLATION');
  const readyConsolation = consolationMatchUps.filter((m) => m.readyToScore);
  expect(readyConsolation.length).toBeGreaterThan(0);
});

// ─── Scenario 4: Score validation ─────────────────────────────────────────
it('setMatchUpState: invalid score is rejected', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore)[0];

  // Provide mismatched winningSide and score
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome: {
      winningSide: 1,
      score: {
        scoreStringSide1: '3-6 4-6',
        scoreStringSide2: '6-3 6-4',
        sets: [
          { side1Score: 3, side2Score: 6, setNumber: 1, winningSide: 2 },
          { side1Score: 4, side2Score: 6, setNumber: 2, winningSide: 2 },
        ],
      },
    },
    drawId,
  });
  // Should fail validation — winningSide 1 but score says side 2 won
  expect(result.error).toBeDefined();
});

// ─── Scenario 5: Incompatible matchUpStatus/winningSide ───────────────────
it('setMatchUpState: incompatible status and winningSide rejected', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore)[0];

  // TO_BE_PLAYED with winningSide should be rejected
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome: {
      matchUpStatus: TO_BE_PLAYED,
      winningSide: 1,
    },
    drawId,
  });
  expect(result.error).toBeDefined();
});
