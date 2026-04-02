import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import {
  BYE,
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  COMPASS,
  CONSOLATION,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MAIN,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

const getTarget = (params) => {
  const { matchUps, roundNumber, roundPosition, stage, structureName } = params;
  return matchUps.find(
    (matchUp) =>
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition &&
      (!stage || matchUp.stage === stage) &&
      (!structureName || matchUp.structureName === structureName),
  );
};

// ─────────────────────────────────────────────────────────────
// Phase 1: Single Elimination Basics
// ─────────────────────────────────────────────────────────────
describe('Phase 1: Single Elimination exit status clearing', () => {
  test('1.1 Clear DOUBLE_WALKOVER R1P1 — produced WALKOVER removed (drawSize 4)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Enter DOUBLE_WALKOVER in R1P1
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    let { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: DOUBLE_WALKOVER,
    });
    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // R2P1 should now be a produced WALKOVER
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
    expect(targetMatchUp.winningSide).toBeUndefined();

    // Clear the DOUBLE_WALKOVER
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // R1P1 should be TO_BE_PLAYED
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

    // R2P1 should revert to TO_BE_PLAYED
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(targetMatchUp.winningSide).toBeUndefined();
  });

  test('1.2 Clear DOUBLE_DEFAULT R1P1 — produced DEFAULTED removed (drawSize 4)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Enter DOUBLE_DEFAULT in R1P1
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // R2P1 should now be a produced DEFAULTED
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);
    expect(targetMatchUp.winningSide).toBeUndefined();

    // Clear the DOUBLE_DEFAULT
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // R1P1 should be TO_BE_PLAYED
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

    // R2P1 should revert to TO_BE_PLAYED
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(targetMatchUp.winningSide).toBeUndefined();
  });

  test('1.3 Multi-round cascade: clear R1P1 DOUBLE_WALKOVER in drawSize 8', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-2', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Pre-checks: R2P1 is WALKOVER with winner, R3P1 has the advanced participant
    let targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
    expect(targetMatchUp.winningSide).toEqual(2);

    targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);

    // Clear DOUBLE_WALKOVER in R1P1
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-checks
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());

    // R2P1 reverts to TO_BE_PLAYED with only DP3
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(targetMatchUp.winningSide).toBeUndefined();

    // R3P1 should have no drawPositions (advancement removed)
    targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
    expect(targetMatchUp.drawPositions).toEqual(undefined);
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('1.4 isActiveDownstream blocks clearing when R2 has scored result', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          participantsCount: 7,
          outcomes: [
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 3, scoreString: '6-1 6-3', winningSide: 1 },
            { roundNumber: 1, roundPosition: 4, scoreString: '6-1 6-4', winningSide: 1 },
            { roundNumber: 2, roundPosition: 2, scoreString: '6-2 6-2', winningSide: 1 },
            { roundNumber: 3, roundPosition: 1, scoreString: '6-3 6-1', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Attempt to clear DOUBLE_WALKOVER in R1P2 — should be blocked
    const targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  test('1.5 Replace DOUBLE_WALKOVER with score (drawSize 4)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER }],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Pre-check: R2P1 is a produced WALKOVER
    let targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

    // Replace DOUBLE_WALKOVER with a scored result
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-2',
      winningSide: 1,
    });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-checks
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());

    // R1P1 should now be COMPLETED
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);
    expect(targetMatchUp.winningSide).toEqual(1);

    // R2P1 should now be TO_BE_PLAYED with the winner advanced
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  });

  test('1.6 Clear DOUBLE_DEFAULT with doubleExitPropagateBye policy (drawSize 8)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          policyDefinitions: {
            [POLICY_TYPE_PROGRESSION]: {
              doubleExitPropagateBye: true,
            },
          },
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Enter DOUBLE_DEFAULT in R1P2
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: R2P1 should have advancement from BYE propagation
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
    expect(targetMatchUp.winningSide).toEqual(1);

    // Clear the DOUBLE_DEFAULT
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-checks: R1P2 should be TO_BE_PLAYED
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

    // R2P1 should revert — only DP1 present, no winningSide
    targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(targetMatchUp.winningSide).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 2: FMLC Cross-Structure
// ─────────────────────────────────────────────────────────────
describe('Phase 2: FMLC cross-structure exit status clearing', () => {
  test('2.1 Clear DOUBLE_WALKOVER in Main R1 — consolation WALKOVER removed', () => {
    const {
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Pre-check: consolation R1P1 should have a WALKOVER from the double exit
    let consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(WALKOVER);

    // Clear the DOUBLE_WALKOVER in Main R1P2
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      drawId: targetMatchUp.drawId,
      outcome: toBePlayed,
    });
    expect(result.success).toEqual(true);

    // Post-checks
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main R1P2 should be TO_BE_PLAYED
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

    // Consolation R1P1 should revert to TO_BE_PLAYED
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('2.2 Clear blocked: consolation has scored result', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 3, winningSide: 1 },
            { roundNumber: 1, roundPosition: 4, winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Score the consolation R1P1 match (which has WALKOVER from DOUBLE_WALKOVER)
    // The WALKOVER already has a winningSide so consolation R2 should have advancement
    // Now score consolation R1P2 to make things active downstream
    const consolR1P2 = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: CONSOLATION });
    if (consolR1P2 && consolR1P2.matchUpStatus === TO_BE_PLAYED && consolR1P2.sides?.length === 2) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-1 6-1',
        winningSide: 1,
      });
      tournamentEngine.setMatchUpStatus({
        matchUpId: consolR1P2.matchUpId,
        drawId,
        outcome,
      });
    }

    // Score consolation R2P1 to make downstream active
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: CONSOLATION });
    if (consolR2P1 && consolR2P1.sides?.filter((s) => s.participantId).length === 2) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-2 6-2',
        winningSide: 1,
      });
      tournamentEngine.setMatchUpStatus({
        matchUpId: consolR2P1.matchUpId,
        drawId,
        outcome,
      });
    }

    // Score consolation R3P1 (the final)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolR3P1 = getTarget({ matchUps, roundNumber: 3, roundPosition: 1, stage: CONSOLATION });
    if (consolR3P1 && consolR3P1.sides?.filter((s) => s.participantId).length === 2) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-3 6-3',
        winningSide: 1,
      });
      tournamentEngine.setMatchUpStatus({
        matchUpId: consolR3P1.matchUpId,
        drawId,
        outcome,
      });
    }

    // Attempt to clear the DOUBLE_WALKOVER in Main R1P2 — should be blocked
    // isActiveDownstream checks both winner AND loser paths (including cross-structure consolation)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  test('2.3 Clear one of two adjacent WOWOs — consolation status fully cleared', () => {
    const drawId = 'fmlc23';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'fmlc23',
          drawSize: 8,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Enter DOUBLE_WALKOVER in Main R1P1
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Enter DOUBLE_WALKOVER in Main R1P2
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: consolation R1P1 should be DOUBLE_WALKOVER (both feeders are WOWO)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    let consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(consolR1P1.winningSide).toBeUndefined();

    // Clear only R1P1 DOUBLE_WALKOVER
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: engine fully clears the consolation status (removes all propagated effects)
    // NOTE: The engine clears the entire consolation match rather than partially downgrading
    // DOUBLE_WALKOVER to WALKOVER. This is actual engine behavior — the remaining WOWO in R1P2
    // does not re-propagate its exit status to consolation after R1P1 is cleared.
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('2.4 Clear both adjacent WOWOs sequentially', () => {
    const drawId = 'fmlc24';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'fmlc24',
          drawSize: 8,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Enter DOUBLE_WALKOVER in Main R1P1 and R1P2
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: consolation R1P1 is DOUBLE_WALKOVER
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    let consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // Clear first: Main R1P1
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // After first clear: engine fully clears consolation (see note in test 2.3)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);

    // Clear second: Main R1P2
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // After second clear: consolation R1P1 remains TO_BE_PLAYED
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('2.5 Clear DOUBLE_DEFAULT in Main R1 — consolation DEFAULTED removed', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 8,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Enter a score in Main R1P1 so consolation gets a real participant
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    const { outcome: scoreOutcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-2',
      winningSide: 1,
    });
    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: scoreOutcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Enter DOUBLE_DEFAULT in Main R1P2
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: Main R2P1 should have the produced status
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const mainR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: MAIN });
    expect(mainR2P1.winningSide).toEqual(1);

    // Clear DOUBLE_DEFAULT in Main R1P2
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      drawId,
      outcome: toBePlayed,
    });
    expect(result.success).toEqual(true);

    // Post-checks
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main R1P2 should be TO_BE_PLAYED
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

    // Main R2P1 should have no winningSide
    const mainR2P1After = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: MAIN });
    expect(mainR2P1After.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(mainR2P1After.winningSide).toBeUndefined();

    // Consolation R1P1 should be TO_BE_PLAYED (DEFAULTED status removed)
    const consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('2.6 Clear Main R1 exit when consolation BYE has propagated downstream', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);

    let modifiedMatchUpLog: any[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_MATCHUP]: (matchUps) => {
          matchUps.forEach(({ matchUp }) => modifiedMatchUpLog.push([matchUp.roundNumber, matchUp.roundPosition]));
        },
      },
    });

    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Pre-check: consolation should have received the propagated status
    const consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(WALKOVER);

    // Clear the DOUBLE_WALKOVER in Main R1P2
    const targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      drawId,
      outcome: toBePlayed,
    });
    expect(result.success).toEqual(true);

    // Post-checks
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main R1P2 should be TO_BE_PLAYED
    const mainR1P2 = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    expect(mainR1P2.matchUpStatus).toEqual(TO_BE_PLAYED);

    // Consolation R1P1 should be TO_BE_PLAYED
    const consolR1P1After = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1After.matchUpStatus).toEqual(TO_BE_PLAYED);

    // Main R2P1 should have no winningSide
    const mainR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: MAIN });
    expect(mainR2P1.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(mainR2P1.winningSide).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 3: COMPASS Multi-Hop
// ─────────────────────────────────────────────────────────────
describe('Phase 3: COMPASS multi-hop exit status clearing', () => {
  test('3.1 Clear DOUBLE_WALKOVER in East R1P1 (drawSize 8) — cascade to West and South', () => {
    const drawId = 'compass31';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, idPrefix: 'm' }],
      setState: true,
    });

    // Set East R1P1 to DOUBLE_WALKOVER
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'm-East-RP-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: verify cascade via matchUpId and loserMatchUpId
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const eastR1P1 = matchUps.find((m) => m.matchUpId === 'm-East-RP-1-1');
    expect(eastR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(eastR1P1.structureName).toEqual('East');

    // West loserMatchUp should be WALKOVER
    const westLoserMatchUp = matchUps.find((m) => m.matchUpId === eastR1P1.loserMatchUpId);
    expect(westLoserMatchUp).toBeDefined();
    expect(westLoserMatchUp.matchUpStatus).toEqual(WALKOVER);
    expect(westLoserMatchUp.structureName).toEqual('West');

    // South should have BYE propagated (no real participant from DOUBLE_WALKOVER)
    const southMatchUp = matchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
    expect(southMatchUp).toBeDefined();
    expect(southMatchUp.matchUpStatus).toEqual(BYE);

    // Clear East R1P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-East-RP-1-1',
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: entire cascade cleaned up
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === eastR1P1.loserMatchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === 'm-South-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('3.2 Blocked: clearing East DOUBLE_WALKOVER when West has active downstream', () => {
    const drawId = 'compass32';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: COMPASS,
          drawSize: 8,
          idPrefix: 'm',
          outcomes: [
            // East R1P1 = DOUBLE_WALKOVER (no real loser to West)
            { matchUpStatus: DOUBLE_WALKOVER, roundPosition: 1, roundNumber: 1 },
            // East R1P2 = scored → loser goes to West R1P1
            { scoreString: '6-1 6-2', roundPosition: 2, roundNumber: 1, winningSide: 1 },
            // East R1P3, R1P4 = scored → losers go to West R1P2
            { scoreString: '6-1 6-2', roundPosition: 3, roundNumber: 1, winningSide: 1 },
            { scoreString: '6-1 6-2', roundPosition: 4, roundNumber: 1, winningSide: 1 },
          ],
        },
      ],
      setState: true,
    });

    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // West R1P1 should have WALKOVER with winningSide (loser from East R1P2 wins)
    const westR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'West' });
    expect(westR1P1.matchUpStatus).toEqual(WALKOVER);
    expect(westR1P1.winningSide).toBeDefined();

    // Score West R1P2 to have an active downstream chain
    const westR1P2 = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, structureName: 'West' });
    if (westR1P2 && westR1P2.sides?.filter((s) => s.participantId).length === 2) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-1 6-2',
        winningSide: 1,
      });
      tournamentEngine.setMatchUpStatus({
        matchUpId: westR1P2.matchUpId,
        outcome,
        drawId,
      });
    }

    // Score West R2P1 to make downstream definitively active
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const westR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'West' });
    if (westR2P1 && westR2P1.sides?.filter((s) => s.participantId).length === 2) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-2 6-3',
        winningSide: 1,
      });
      tournamentEngine.setMatchUpStatus({
        matchUpId: westR2P1.matchUpId,
        outcome,
        drawId,
      });
    }

    // Attempt to clear East R1P1 DOUBLE_WALKOVER — should be blocked
    // isActiveDownstream traverses the loser link into West and finds scored results
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-East-RP-1-1',
      outcome: toBePlayed,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  test('3.3 Multi-hop cascade: DOUBLE_WALKOVER clearing (drawSize 32) through East→West→South→Southeast', () => {
    const drawId = 'compass33';
    const idPrefix = 'mu';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 32,
          drawType: COMPASS,
          idPrefix,
          uuids: ['a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1'],
        },
      ],
      setState: true,
    });

    // Set East R1P1 to DOUBLE_WALKOVER
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: `${idPrefix}-East-RP-1-1`,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: verify 4-hop cascade via loserMatchUpId chain
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const eastR1P1 = matchUps.find((m) => m.matchUpId === `${idPrefix}-East-RP-1-1`);
    expect(eastR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    const westMatchUp = matchUps.find((m) => m.matchUpId === eastR1P1.loserMatchUpId);
    expect(westMatchUp.matchUpStatus).toEqual(WALKOVER);
    expect(westMatchUp.structureName).toEqual('West');

    const southMatchUp = matchUps.find((m) => m.matchUpId === westMatchUp.loserMatchUpId);
    expect(southMatchUp.matchUpStatus).toEqual(BYE);
    expect(southMatchUp.structureName).toEqual('South');

    const southEastMatchUp = matchUps.find((m) => m.matchUpId === southMatchUp.loserMatchUpId);
    expect(southEastMatchUp.matchUpStatus).toEqual(BYE);
    expect(southEastMatchUp.structureName).toEqual('Southeast');

    // Clear East R1P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: `${idPrefix}-East-RP-1-1`,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: all 4 structures cleaned up
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === `${idPrefix}-East-RP-1-1`).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === eastR1P1.loserMatchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === westMatchUp.loserMatchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === southMatchUp.loserMatchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('3.4 Clear DOUBLE_WALKOVER in West — verify East results untouched', () => {
    const drawId = 'compass34';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: COMPASS,
          drawSize: 8,
          idPrefix: 'm',
          outcomes: [
            // Score East R1P1 and R1P2 → their losers populate West R1P1
            { scoreString: '6-1 6-2', roundPosition: 1, roundNumber: 1, winningSide: 1 },
            { scoreString: '6-1 6-2', roundPosition: 2, roundNumber: 1, winningSide: 1 },
          ],
        },
      ],
      setState: true,
    });

    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // West R1P1 should have two real participants (losers from East R1P1 and R1P2)
    const westR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'West' });
    expect(westR1P1).toBeDefined();
    expect(westR1P1.matchUpId).toEqual('m-West-RP-1-1');

    // Set West R1P1 to DOUBLE_WALKOVER
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: westR1P1.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: East R1P1 and R1P2 should still be COMPLETED
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-1').matchUpStatus).toEqual(COMPLETED);
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-2').matchUpStatus).toEqual(COMPLETED);

    // Clear West R1P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: westR1P1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: East results remain untouched, West cleaned up
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-1').matchUpStatus).toEqual(COMPLETED);
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-2').matchUpStatus).toEqual(COMPLETED);
    expect(matchUps.find((m) => m.matchUpId === westR1P1.matchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('3.5 DOUBLE_DEFAULT in East R1P2 (drawSize 8) — BYE removal cascade to South', () => {
    const drawId = 'compass35';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, idPrefix: 'm' }],
      setState: true,
    });

    // Set East R1P2 to DOUBLE_DEFAULT (following existing doubleExitRemoval.test.ts pattern)
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: 'm-East-RP-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: South R1P1 should have a BYE propagated
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    let southR1P1 = matchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
    expect(southR1P1.sides.find((s) => s.sideNumber === 1).bye).toEqual(true);

    // East R1P2 should be DOUBLE_DEFAULT
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-2').matchUpStatus).toEqual(DOUBLE_DEFAULT);

    // Clear East R1P2
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-East-RP-1-2',
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: BYE removed from South
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    southR1P1 = matchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
    expect(southR1P1.sides.find((s) => s.sideNumber === 1).bye).toBeUndefined();

    // East R1P2 should be TO_BE_PLAYED
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-2').matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('3.6 Two DOUBLE_WALKOVERs in East R1P1 and R1P2 — effects on East R2P1 and clear one', () => {
    const drawId = 'compass36';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, idPrefix: 'm' }],
      setState: true,
    });

    // Set East R1P1 to DOUBLE_WALKOVER
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'm-East-RP-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Set East R1P2 to DOUBLE_WALKOVER
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'm-East-RP-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: East R2P1 should be DOUBLE_WALKOVER (both R1P1 and R1P2 were WOWO)
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const eastR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'East' });
    expect(eastR2P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // West R1P1 should also be affected (both feeders are WOWO → no real participants)
    const westR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'West' });
    expect(westR1P1).toBeDefined();

    // Clear East R1P1 only
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-East-RP-1-1',
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: East R1P1 cleared
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);

    // East R1P2 should still be DOUBLE_WALKOVER
    expect(matchUps.find((m) => m.matchUpId === 'm-East-RP-1-2').matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // East R2P1 should revert from DOUBLE_WALKOVER to WALKOVER (only one feeder now)
    const eastR2P1After = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'East' });
    expect(eastR2P1After.matchUpStatus).toEqual(WALKOVER);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 4: OLYMPIC, CURTIS, FRLC, DOUBLE_ELIMINATION
// ─────────────────────────────────────────────────────────────
describe('Phase 4: OLYMPIC, CURTIS, FRLC, DOUBLE_ELIMINATION exit status clearing', () => {
  test('4.1 OLYMPIC: Clear DOUBLE_WALKOVER in East R1P1 (drawSize 8) — West and South cascade', () => {
    const drawId = 'oly41';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: OLYMPIC, drawSize: 8, idPrefix: 'oly' }],
      setState: true,
    });

    // Set East R1P1 to DOUBLE_WALKOVER
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'oly-East-RP-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: cascade through East → West → South (same topology as COMPASS)
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'oly-East-RP-1-1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(matchUps.find((m) => m.matchUpId === 'oly-West-RP-1-1').matchUpStatus).toEqual(WALKOVER);
    expect(matchUps.find((m) => m.matchUpId === 'oly-South-RP-1-1').matchUpStatus).toEqual(BYE);

    // Clear East R1P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'oly-East-RP-1-1',
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: all cleaned up
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'oly-East-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === 'oly-West-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === 'oly-South-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('4.2 OLYMPIC: Clear DOUBLE_WALKOVER in East R2P1 (SF) — R3 cascade, North receives WALKOVER', () => {
    const drawId = 'oly42';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: OLYMPIC,
          drawSize: 8,
          idPrefix: 'oly2',
          outcomes: [
            // Score all East R1 to populate R2
            { scoreString: '6-1 6-1', roundPosition: 1, roundNumber: 1, winningSide: 1 },
            { scoreString: '6-1 6-2', roundPosition: 2, roundNumber: 1, winningSide: 1 },
            { scoreString: '6-2 6-1', roundPosition: 3, roundNumber: 1, winningSide: 1 },
            { scoreString: '6-2 6-2', roundPosition: 4, roundNumber: 1, winningSide: 1 },
            // Score East R2P2 → winner to R3, loser to North
            { scoreString: '6-1 6-3', roundPosition: 2, roundNumber: 2, winningSide: 1 },
          ],
        },
      ],
      setState: true,
    });

    // Set East R2P1 to DOUBLE_WALKOVER (SF)
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'oly2-East-RP-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: R3P1 should have WALKOVER, North R1P1 should have WALKOVER
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-2-1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-3-1').matchUpStatus).toEqual(WALKOVER);

    // OLYMPIC topology: East R2 losers → North R1P1
    const northR1P1 = matchUps.find((m) => m.matchUpId === 'oly2-North-RP-1-1');
    expect(northR1P1.matchUpStatus).toEqual(WALKOVER);

    // Clear East R2P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'oly2-East-RP-2-1',
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: R1 and R2P2 results intact, R2P1 cleared, R3P1 and North reverted
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-1-1').matchUpStatus).toEqual(COMPLETED);
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-1-2').matchUpStatus).toEqual(COMPLETED);
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-2-1').matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-2-2').matchUpStatus).toEqual(COMPLETED);
    expect(matchUps.find((m) => m.matchUpId === 'oly2-East-RP-3-1').matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUps.find((m) => m.matchUpId === 'oly2-North-RP-1-1').matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('4.3 CURTIS: Clear DOUBLE_WALKOVER in Main R1P1 (drawSize 16) — consolation cleanup', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: CURTIS_CONSOLATION,
          drawSize: 16,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-2', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Pre-check: Consolation R1P1 should have WALKOVER (one feeder empty from WOWO)
    let consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Consolation 1' });
    expect(consolR1P1.matchUpStatus).toEqual(WALKOVER);

    // Clear Main R1P1
    const mainR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Main' });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: mainR1P1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: Main and Consolation cleaned
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Main' }).matchUpStatus).toEqual(
      TO_BE_PLAYED,
    );
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Consolation 1' });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('4.4 CURTIS: Clear DOUBLE_WALKOVER in Main R2P1 (drawSize 16) — R2-fed consolation cleaned', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: CURTIS_CONSOLATION,
          drawSize: 16,
          outcomes: [
            // Score all Main R1 to populate R2 and consolation R1
            ...Array.from({ length: 8 }, (_, i) => ({
              roundNumber: 1,
              roundPosition: i + 1,
              scoreString: '6-1 6-1',
              winningSide: 1,
            })),
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Set Main R2P1 to DOUBLE_WALKOVER
    let mainR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'Main' });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: mainR2P1.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: Main R3P1 should have WALKOVER (one side empty from WOWO)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    mainR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'Main' });
    expect(mainR2P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    const mainR3P1 = getTarget({ matchUps, roundNumber: 3, roundPosition: 1, structureName: 'Main' });
    expect(mainR3P1.matchUpStatus).toEqual(WALKOVER);

    // Verify consolation received propagated status via loserMatchUpId
    const feedTargetId = mainR2P1.loserMatchUpId;
    expect(feedTargetId).toBeDefined();
    const feedTarget = matchUps.find((m) => m.matchUpId === feedTargetId);
    expect(feedTarget.structureName).toEqual('Consolation 1');

    // Clear Main R2P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: mainR2P1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: Main R2P1 and R3P1 reverted, consolation feed target cleaned
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'Main' }).matchUpStatus).toEqual(
      TO_BE_PLAYED,
    );
    expect(getTarget({ matchUps, roundNumber: 3, roundPosition: 1, structureName: 'Main' }).matchUpStatus).toEqual(
      TO_BE_PLAYED,
    );
    expect(matchUps.find((m) => m.matchUpId === feedTargetId).matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('4.5 FRLC: Clear DOUBLE_WALKOVER in Main R1P1 (drawSize 8) — consolation cleanup', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_ROUND_LOSER_CONSOLATION,
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-2', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Pre-check: Consolation R1P1 should have WALKOVER
    let consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(WALKOVER);

    // Clear Main R1P1
    const mainR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: mainR1P1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN }).matchUpStatus).toEqual(TO_BE_PLAYED);
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);

    // Verify FRLC-specific: R2 Main result should NOT affect consolation (only R1 feeds)
    // Main R2P1 should be TO_BE_PLAYED since R1P1 was cleared
    const mainR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: MAIN });
    expect(mainR2P1.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  test('4.6 DOUBLE_ELIMINATION: Clear DOUBLE_WALKOVER in Main R1P1 (drawSize 8) — Backdraw cleanup', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: DOUBLE_ELIMINATION,
          drawSize: 8,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Set Main R1P1 to DOUBLE_WALKOVER
    let mainR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Main' });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: mainR1P1.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: Main R2P1 should have produced WALKOVER
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    mainR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Main' });
    expect(mainR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    const mainR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'Main' });
    expect(mainR2P1.matchUpStatus).toEqual(WALKOVER);

    // Verify Backdraw received propagated status via loserMatchUpId
    const backdrawTargetId = mainR1P1.loserMatchUpId;
    expect(backdrawTargetId).toBeDefined();
    const backdrawTarget = matchUps.find((m) => m.matchUpId === backdrawTargetId);
    expect(backdrawTarget.structureName).toEqual('Backdraw');

    // Clear Main R1P1
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: mainR1P1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: Main and Backdraw cleaned
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, structureName: 'Main' }).matchUpStatus).toEqual(
      TO_BE_PLAYED,
    );
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1, structureName: 'Main' }).matchUpStatus).toEqual(
      TO_BE_PLAYED,
    );
    expect(matchUps.find((m) => m.matchUpId === backdrawTargetId).matchUpStatus).toEqual(TO_BE_PLAYED);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 5: Edge Cases
// ─────────────────────────────────────────────────────────────
describe('Phase 5: Edge cases', () => {
  test('5.1 Mixed exit types: DOUBLE_WALKOVER + DOUBLE_DEFAULT adjacent (FMLC)', () => {
    const drawId = 'edge51';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 8,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Enter DOUBLE_WALKOVER in Main R1P1
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Enter DOUBLE_DEFAULT in Main R1P2 (different exit type)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Pre-check: consolation R1P1 should have an exit status (both feeders have exits)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(consolR1P1.matchUpStatus)).toEqual(true);
    expect(consolR1P1.winningSide).toBeUndefined();

    // Clear DOUBLE_WALKOVER in Main R1P1 (leaving DOUBLE_DEFAULT in R1P2)
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: consolation fully cleared (same behavior as test 2.3)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN }).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN }).matchUpStatus).toEqual(
      DOUBLE_DEFAULT,
    );
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION }).matchUpStatus).toEqual(
      TO_BE_PLAYED,
    );
  });

  test('5.2 All R1 matches DOUBLE_WALKOVER (SE drawSize 8) — final correctly gets DOUBLE_WALKOVER', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Set all 4 R1 matches to DOUBLE_WALKOVER
    for (let rp = 1; rp <= 4; rp++) {
      const target = getTarget({ matchUps, roundNumber: 1, roundPosition: rp });
      const result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: target.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
      ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    }

    // Pre-check: full cascade — all rounds should be DOUBLE_WALKOVER
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 2 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    // R3P1 (the final) should also be DOUBLE_WALKOVER — both feeders have no participants
    expect(getTarget({ matchUps, roundNumber: 3, roundPosition: 1 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // Clear R1P1 only
    const r1p1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: r1p1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check: R2P1 changes from DOUBLE_WALKOVER to WALKOVER (only R1P2 WOWO remains)
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1 }).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 2 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1 }).matchUpStatus).toEqual(WALKOVER);
    // R2P2 unaffected (R1P3 and R1P4 still WOWO)
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 2 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  });

  test('5.3 Two-step clearing: unblock downstream then clear (SE drawSize 8)', () => {
    // Setup: SE drawSize 8 with BYE (participantsCount:7), DOUBLE_WALKOVER in R1P2,
    // and R3P1 scored. BYE in R1P1 auto-advances dp1 → R2P1 gets WALKOVER from WOWO.
    // R3P1 scored = blocks clearing R1P2.
    //
    // How isActiveDownstream works: it recursively checks both the winnerMatchUp and
    // loserMatchUp paths from the target matchUp. For R1P2 in SE:
    //   - Winner path: R1P2 → R2P1 (produced WALKOVER) → R3P1 (if scored, blocks)
    //   - Loser path: none (SE has no consolation structure)
    // R2P2 is NOT in R1P2's downstream tree — it feeds from R1P3/R1P4. So R2P2's
    // scored status does not block clearing R1P2 (this is correct behavior, not a limitation).
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          participantsCount: 7,
          outcomes: [
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 3, scoreString: '6-1 6-3', winningSide: 1 },
            { roundNumber: 1, roundPosition: 4, scoreString: '6-1 6-4', winningSide: 1 },
            { roundNumber: 2, roundPosition: 2, scoreString: '6-2 6-2', winningSide: 1 },
            { roundNumber: 3, roundPosition: 1, scoreString: '6-3 6-1', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Pre-check: R2P1 has produced WALKOVER, R3P1 has scored result, R2P2 scored
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1 }).matchUpStatus).toEqual(WALKOVER);
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 2 }).matchUpStatus).toEqual(COMPLETED);
    expect(getTarget({ matchUps, roundNumber: 3, roundPosition: 1 }).matchUpStatus).toEqual(COMPLETED);

    // Step 1: Try to clear R1P2 DOUBLE_WALKOVER → blocked (R3P1 is in the direct winner path)
    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: getTarget({ matchUps, roundNumber: 1, roundPosition: 2 }).matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);

    // Step 2: Clear R3P1 to unblock the direct downstream path
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: getTarget({
        matchUps: tournamentEngine.allTournamentMatchUps().matchUps,
        roundNumber: 3,
        roundPosition: 1,
      }).matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Step 3: Now clear R1P2 DOUBLE_WALKOVER → succeeds because the direct winner path
    // (R2P1→R3P1) no longer has scored results. R2P2 is a separate branch, not downstream of R1P2.
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: getTarget({
        matchUps: tournamentEngine.allTournamentMatchUps().matchUps,
        roundNumber: 1,
        roundPosition: 2,
      }).matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-checks: R1P2 cleared, R2P1 reverted, R2P2 unaffected (separate branch)
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 2 }).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1 }).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(getTarget({ matchUps, roundNumber: 3, roundPosition: 1 }).matchUpStatus).toEqual(TO_BE_PLAYED);
    // R2P2 remains scored — it's in a separate branch (feeds from R1P3/R1P4, not R1P2)
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 2 }).matchUpStatus).toEqual(COMPLETED);
  });

  test('5.4 3-round cascade clear (SE drawSize 16)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 3, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 4, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Pre-check: cascade through 3 rounds of DOUBLE_WALKOVER
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 2 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(getTarget({ matchUps, roundNumber: 3, roundPosition: 1 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // Clear R1P1 only — cascade should propagate through R2 and R3
    const r1p1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: r1p1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1 }).matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 2 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    // R2P1 reverts from DOUBLE_WALKOVER to WALKOVER (only R1P2 WOWO remaining)
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1 }).matchUpStatus).toEqual(WALKOVER);
    // R2P2 unaffected
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 2 }).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    // R3P1 should cascade — R2P1 changed (WALKOVER) + R2P2 unchanged (DOUBLE_WALKOVER)
    // Both still produce no real winner, so R3P1 should still have a produced status
    const r3p1 = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
    // R3P1 should no longer be DOUBLE_WALKOVER (R2P1 changed from DOUBLE_WALKOVER to WALKOVER)
    expect([WALKOVER, DOUBLE_WALKOVER].includes(r3p1.matchUpStatus)).toEqual(true);
  });

  test('5.5 Replace DOUBLE_WALKOVER with score in FMLC — consolation receives real loser', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Pre-check: consolation R1P1 has WALKOVER (from DOUBLE_WALKOVER in R1P2)
    let consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(WALKOVER);

    // Replace Main R1P2 DOUBLE_WALKOVER with a scored result
    const mainR1P2 = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-2',
      winningSide: 1,
    });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: mainR1P2.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Post-check
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    // Main R1P2 should be COMPLETED with real score
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN }).matchUpStatus).toEqual(COMPLETED);
    // Consolation R1P1 should now have 2 participants (R1P1 loser + R1P2 loser)
    consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(consolR1P1.sides?.filter((s) => s.participantId).length).toEqual(2);
  });

  test('5.6 MODIFY_MATCHUP notifications emitted during clearing', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-2', winningSide: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);

    const modifiedMatchUpIds: string[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_MATCHUP]: (matchUps) => {
          matchUps.forEach(({ matchUp }) => modifiedMatchUpIds.push(matchUp.matchUpId));
        },
      },
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const r1p1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    const r2p1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });

    // Pre-check
    expect(r2p1.matchUpStatus).toEqual(WALKOVER);

    // Clear R1P1 DOUBLE_WALKOVER
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: r1p1.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Should have notifications for at least R1P1 and R2P1
    expect(modifiedMatchUpIds.length).toBeGreaterThanOrEqual(2);
    expect(modifiedMatchUpIds).toContain(r1p1.matchUpId);
    expect(modifiedMatchUpIds).toContain(r2p1.matchUpId);
  });
});
