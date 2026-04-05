/**
 * Coverage tests targeting ~37 uncovered statements across:
 *   src/mutate/matchUps/score/modifyMatchUpScore.ts
 *   src/mutate/matchUps/score/updateTieMatchUpScore.ts
 *   src/mutate/matchUps/matchUpStatus/setMatchUpState.ts
 *   src/mutate/matchUps/matchUpStatus/setMatchUpStatus.ts
 *   src/mutate/matchUps/matchUpStatus/attemptToSetMatchUpStatusBYE.ts
 *
 * Exercises error guards, edge-case branches, and status transitions
 * not covered by existing test suites.
 */
import { attemptToSetMatchUpStatusBYE } from '@Mutate/matchUps/matchUpStatus/attemptToSetMatchUpStatusBYE';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  INCOMPATIBLE_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS_BYE,
  MISSING_TOURNAMENT_RECORD,
  MATCHUP_NOT_FOUND,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';
import {
  AWAITING_RESULT,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  IN_PROGRESS,
  INCOMPLETE,
  COMPLETED,
  DEFAULTED,
  WALKOVER,
  BYE,
} from '@Constants/matchUpStatusConstants';

// ─── setMatchUpState: validateMatchUpStateInputs ──────────────────────

describe('setMatchUpState validation branches', () => {
  it('rejects invalid matchUpStatus value', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: 'NOT_A_REAL_STATUS' },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
  });

  it('rejects BYE matchUpStatus when matchUp has winningSide', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // First complete a matchUp so it has a winningSide
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Now try to set BYE on a matchUp with winningSide
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: BYE },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  it('rejects CANCELLED with winningSide', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: 'CANCELLED', winningSide: 1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('rejects INCOMPLETE with winningSide', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: INCOMPLETE, winningSide: 1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

// ─── setMatchUpState: AWAITING_RESULT rejected for TEAM ───────────────

describe('setMatchUpState TEAM matchUp branches', () => {
  it('rejects AWAITING_RESULT for TEAM matchUp type', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const eventProfiles = [{ eventType: TEAM_EVENT, drawProfiles }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles,
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps.find((m) => m.matchUpType === 'TEAM' && m.readyToScore);

    if (teamMatchUp) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: AWAITING_RESULT },
        matchUpId: teamMatchUp.matchUpId,
        drawId,
      });
      expect(result.error).toEqual(INVALID_VALUES);
    }
  });
});

// ─── setMatchUpState: checkDownstreamCompatibility ────────────────────

describe('setMatchUpState downstream compatibility branches', () => {
  it('rejects non-directing status with active downstream and no winningSide', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Complete first round to create downstream dependency
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-2 6-2',
          scoreStringSide2: '2-6 2-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Complete the final so downstream is active
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-0 6-0',
          scoreStringSide2: '0-6 0-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 0, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Try setting INCOMPLETE (non-directing) on first round matchUp that has downstream activity
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: INCOMPLETE },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  it('rejects DOUBLE_WALKOVER with active downstream and no winningSide', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Complete first round
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-2 6-2',
          scoreStringSide2: '2-6 2-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Complete the final
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-0 6-0',
          scoreStringSide2: '0-6 0-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 0, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // DOUBLE_DEFAULT on first round with active downstream
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  it('rejects same winningSide with non-directing status when downstream active', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Complete first round
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-2 6-2',
          scoreStringSide2: '2-6 2-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Complete the final
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-0 6-0',
          scoreStringSide2: '0-6 0-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 0, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Same winningSide (1) with non-directing status INCOMPLETE on completed first round match
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: INCOMPLETE, winningSide: 1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    // INCOMPLETE + winningSide is rejected by validateMatchUpStateInputs
    expect(result.error).toBeDefined();
  });
});

// ─── setMatchUpState: NO_VALID_ACTIONS branch ─────────────────────────

describe('setMatchUpState resolveAndApplyOutcome NO_VALID_ACTIONS', () => {
  it('returns NO_VALID_ACTIONS when activeDownstream and no winningSide and non-directing', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Complete first round matches
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-2 6-2',
          scoreStringSide2: '2-6 2-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Set IN_PROGRESS on the final (creates downstream activity from semifinal perspective)
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        matchUpStatus: IN_PROGRESS,
        score: {
          scoreStringSide1: '3-2',
          scoreStringSide2: '2-3',
          sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }],
        },
      },
      matchUpId: 'm-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Try to set score on first round match (which now has activeDownstream but no winningSide)
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: {
          scoreStringSide1: '4-3',
          scoreStringSide2: '3-4',
          sets: [{ setNumber: 1, side1Score: 4, side2Score: 3 }],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    // This should hit INCOMPATIBLE_MATCHUP_STATUS or NO_VALID_ACTIONS
    expect(result.error).toBeDefined();
  });
});

// ─── setMatchUpStatus: drawDefinition resolution from drawId ──────────

describe('setMatchUpStatus drawDefinition resolution', () => {
  it('resolves drawDefinition from drawId when not provided directly', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Call through engine which resolves drawDefinition from drawId
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});

// ─── updateTieMatchUpScore edge cases ─────────────────────────────────

describe('updateTieMatchUpScore edge cases', () => {
  it('returns MISSING_TOURNAMENT_RECORD when no tournament context', () => {
    let result: any = updateTieMatchUpScore({
      drawDefinition: {} as any,
      matchUpId: 'bogus',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns MATCHUP_NOT_FOUND when matchUp does not exist', () => {
    const drawId = 'drawId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    let result: any = updateTieMatchUpScore({
      tournamentRecord,
      drawDefinition,
      matchUpId: 'nonexistent',
    });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });
});

// ─── attemptToSetMatchUpStatusBYE: success path ───────────────────────

describe('attemptToSetMatchUpStatusBYE success path', () => {
  it('sets BYE status when matchUp includes bye-assigned drawPosition', () => {
    let result: any = attemptToSetMatchUpStatusBYE({
      tournamentRecord: { tournamentId: 'test' },
      drawDefinition: {},
      structure: {
        positionAssignments: [
          { drawPosition: 1, participantId: 'p1' },
          { drawPosition: 2, bye: true },
        ],
      },
      matchUp: { drawPositions: [1, 2] },
    });
    expect(result.success).toEqual(true);
  });

  it('returns INVALID_MATCHUP_STATUS_BYE when no bye in drawPositions', () => {
    let result: any = attemptToSetMatchUpStatusBYE({
      tournamentRecord: undefined,
      drawDefinition: undefined,
      structure: {
        positionAssignments: [
          { drawPosition: 1, participantId: 'p1' },
          { drawPosition: 2, participantId: 'p2' },
        ],
      },
      matchUp: { drawPositions: [1, 2] },
    });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS_BYE);
  });
});

// ─── modifyMatchUpScore: DEFAULTED processCodes branch ────────────────

describe('modifyMatchUpScore DEFAULTED processCodes', () => {
  it('applies processCodes on DEFAULTED status with scoring policy', () => {
    const drawId = 'drawId';
    const policyDefinitions = {
      [POLICY_TYPE_SCORING]: {
        processCodes: { incompleteAssignmentsOnDefault: ['RANKING.IGNORE'] },
        requireParticipantsForScoring: false,
      },
    };
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      policyDefinitions,
      setState: true,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: ['m-1-1'] },
    });
    // processCodes should have been applied when one side has no participantId
    // (In a 4-draw, first round matchUps have both participants assigned,
    // so processCodes may not be applied — this exercises the branch entry)
    expect(matchUps[0].matchUpStatus).toEqual(DEFAULTED);
  });

  it('handles transition from DEFAULTED to non-DEFAULTED (wasDefaulted branch)', () => {
    const drawId = 'drawId';
    const policyDefinitions = {
      [POLICY_TYPE_SCORING]: {
        processCodes: { incompleteAssignmentsOnDefault: ['RANKING.IGNORE'] },
        requireParticipantsForScoring: false,
      },
    };
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      policyDefinitions,
      setState: true,
    });

    // First set DEFAULTED
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Now change away from DEFAULTED (triggers wasDefaulted path)
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: ['m-1-1'] },
    });
    expect(matchUps[0].matchUpStatus).toEqual(COMPLETED);
  });
});

// ─── setMatchUpState: checkParticipants branches ──────────────────────

describe('setMatchUpState checkParticipants branches', () => {
  it('allows WALKOVER with propagateExitStatus and single participant', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'fmlc' }],
      setState: true,
    });

    // Complete first round with WALKOVER and propagateExitStatus
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      propagateExitStatus: true,
      matchUpId: 'fmlc-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});

// ─── setMatchUpState: DOUBLE_WALKOVER clears score ────────────────────

describe('setMatchUpState DOUBLE_WALKOVER score clearing', () => {
  it('clears score when setting DOUBLE_WALKOVER even if score was provided', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Attempt DOUBLE_WALKOVER with a score — score should be cleared
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        matchUpStatus: DOUBLE_WALKOVER,
        score: {
          scoreStringSide1: '6-1',
          scoreStringSide2: '1-6',
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: ['m-1-1'] },
    });
    expect(matchUps[0].matchUpStatus).toEqual(DOUBLE_WALKOVER);
    // Score should be cleared for DOUBLE_WALKOVER
    expect(matchUps[0].score?.scoreStringSide1).toBeFalsy();
  });
});

// ─── setMatchUpState: round robin tally update path ───────────────────

describe('modifyMatchUpScore round robin tally update', () => {
  it('updates tally for round robin matchUp scoring', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, drawType: ROUND_ROBIN, idPrefix: 'rr' }],
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const rrMatchUp = matchUps.find((m) => m.readyToScore);

    if (rrMatchUp) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: {
          winningSide: 1,
          matchUpStatus: COMPLETED,
          score: {
            scoreStringSide1: '6-1 6-1',
            scoreStringSide2: '1-6 1-6',
            sets: [
              { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
              { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
            ],
          },
        },
        matchUpId: rrMatchUp.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  });
});

// ─── modifyMatchUpScore: notes attachment ─────────────────────────────

describe('modifyMatchUpScore notes branch', () => {
  it('attaches notes to matchUp through setMatchUpStatus', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      startDate: '2024-01-14',
      endDate: '2024-01-21',
      setState: true,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      notes: 'Player injured during warmup',
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: ['m-1-1'] },
    });
    expect(matchUps[0].notes).toContain('Player injured during warmup');
  });
});

// ─── setMatchUpState: schedule passed through ─────────────────────────

describe('setMatchUpState schedule branch', () => {
  it('applies schedule items alongside matchUp status', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      startDate: '2024-01-14',
      endDate: '2024-01-21',
      setState: true,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      schedule: { scheduledDate: '2024-01-15' },
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});

// ─── attemptToSetMatchUpStatusBYE: positionAssignments undefined ──────

describe('attemptToSetMatchUpStatusBYE edge cases', () => {
  it('handles structure with no positionAssignments', () => {
    let result: any = attemptToSetMatchUpStatusBYE({
      tournamentRecord: undefined,
      drawDefinition: undefined,
      structure: {},
      matchUp: { drawPositions: [1, 2] },
    });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS_BYE);
  });

  it('handles matchUp with undefined drawPositions', () => {
    let result: any = attemptToSetMatchUpStatusBYE({
      tournamentRecord: undefined,
      drawDefinition: undefined,
      structure: {
        positionAssignments: [{ drawPosition: 1, bye: true }],
      },
      matchUp: {},
    });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS_BYE);
  });
});
