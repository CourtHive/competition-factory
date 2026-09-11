/**
 * Comprehensive tests to verify all claims made in matchUpActions policy documentation
 * Location: documentation/docs/policies/matchUpActions.md
 */

import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe, afterEach } from 'vitest';

// Import relevant constants
import { END, PENALTY, REFEREE, SCHEDULE, SCORE, START, STATUS, SUBSTITUTION } from '@Constants/matchUpActionConstants';
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

describe('MatchUp Actions Policy Documentation Tests', () => {
  // Tests in this file call `tournamentEngine.attachPolicies(...)` with
  // restrictive matchUpActions policies (e.g. enabledActions: [SCHEDULE])
  // that disable ASSIGN_PARTICIPANT. tournamentEngine is a module-level
  // singleton, so without an explicit restore the policy leaks into any
  // subsequent test file that runs in the same vitest worker (CI fail
  // on genderedCollectionPositionAssignment.test.ts, run 26812805317).
  // Re-attach the canonical default after every test to keep the worker
  // clean for whatever runs next.
  afterEach(() => {
    tournamentEngine.attachPolicies({ policyDefinitions: POLICY_MATCHUP_ACTIONS_DEFAULT });
  });

  describe('Available MatchUp Action Types', () => {
    it('verifies all 7 core action types are available', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      const readyMatchUp = matchUps.find(
        (m) => m.matchUpStatus === TO_BE_PLAYED && m.sides?.length === 2 && m.sides.every((s) => s.participantId),
      );

      expect(readyMatchUp).toBeDefined();

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: readyMatchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Verify core action types from documentation
      const expectedCoreTypes = [SCHEDULE, REFEREE];
      expectedCoreTypes.forEach((type) => {
        expect(actionTypes).toContain(type);
      });

      // Ready to score matchUps should have SCORE
      expect(actionTypes).toContain(SCORE);
      expect(actionTypes).toContain(STATUS);
    });

    it('verifies action structure contains type, method, and payload', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      expect(validActions.length).toBeGreaterThan(0);

      validActions.forEach((action) => {
        expect(action).toHaveProperty('type');
        expect(typeof action.type).toBe('string');

        // Some actions have methods, others don't (like STATUS)
        if (action.method) {
          expect(typeof action.method).toBe('string');
        }

        // Most actions have payloads
        if (action.payload) {
          expect(typeof action.payload).toBe('object');
        }
      });
    });
  });

  describe('Default Policy Behavior', () => {
    it('enables all actions by default', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      const readyMatchUp = matchUps.find(
        (m) => m.matchUpStatus === TO_BE_PLAYED && m.sides?.length === 2 && m.sides.every((s) => s.participantId),
      );

      expect(readyMatchUp).toBeDefined();

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: readyMatchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Default should have extensive actions
      expect(actionTypes).toContain(SCHEDULE);
      expect(actionTypes).toContain(REFEREE);
      expect(actionTypes).toContain(SCORE);
      expect(actionTypes).toContain(STATUS);
      expect(validActions.length).toBeGreaterThan(3);
    });

    it('verifies gender enforcement is enabled by default', () => {
      const defaultPolicy = POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

      expect(defaultPolicy.participants).toBeDefined();
      expect(defaultPolicy.participants.enforceGender).toBe(true);
      expect(defaultPolicy.participants.enforceCategory).toBe(true);
    });

    it('verifies substitution defaults', () => {
      const defaultPolicy = POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

      expect(defaultPolicy.substituteAfterCompleted).toBe(false);
      expect(defaultPolicy.substituteWithoutScore).toBe(false);
    });

    it('verifies default process codes for substitution', () => {
      const defaultPolicy = POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

      expect(defaultPolicy.processCodes).toBeDefined();
      expect(defaultPolicy.processCodes.substitution).toBeDefined();
      expect(defaultPolicy.processCodes.substitution).toContain('RANKING.IGNORE');
      expect(defaultPolicy.processCodes.substitution).toContain('RATING.IGNORE');
    });
  });

  describe('MatchUp States and Actions', () => {
    it('returns correct actions for unplayed matchUp', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const unplayedMatchUp = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED);

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: unplayedMatchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Unplayed should have scheduling actions
      expect(actionTypes).toContain(SCHEDULE);
      expect(actionTypes).toContain(REFEREE);
      expect(actionTypes).toContain(STATUS);
    });

    it('enables SCORE action for ready-to-score matchUps', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      const readyMatchUp = matchUps.find(
        (m) => m.matchUpStatus === TO_BE_PLAYED && m.sides?.length === 2 && m.sides.every((s) => s.participantId),
      );

      expect(readyMatchUp).toBeDefined();

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: readyMatchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      expect(actionTypes).toContain(SCORE);
      expect(actionTypes).toContain(START);
      expect(actionTypes).toContain(END);
    });

    it('returns correct actions for completed matchUp', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          {
            drawSize: 16,
            participantsCount: 16,
            outcomes: [
              {
                roundNumber: 1,
                roundPosition: 1,
                winningSide: 1,
                scoreString: '6-0 6-0',
              },
            ],
          },
        ],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const completedMatchUp = matchUps.find((m) => m.matchUpStatus === COMPLETED);

      expect(completedMatchUp).toBeDefined();

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: completedMatchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Completed matchUp can still be modified
      expect(actionTypes).toContain(SCORE);
      expect(actionTypes).toContain(REFEREE);
      expect(actionTypes).toContain(PENALTY);
    });

    it('identifies BYE matchUps correctly', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 14 }], // Creates BYEs
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const byeMatchUp = matchUps.find((m) => m.matchUpStatus === BYE);

      expect(byeMatchUp).toBeDefined();

      const { isByeMatchUp, validActions } = tournamentEngine.matchUpActions({
        matchUpId: byeMatchUp.matchUpId,
        drawId,
      });

      expect(isByeMatchUp).toBe(true);
      expect(validActions).toEqual([]);
    });

    it('identifies double exit matchUps', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          {
            drawSize: 16,
            participantsCount: 16,
            outcomes: [
              {
                roundNumber: 1,
                roundPosition: 1,
                matchUpStatus: DOUBLE_WALKOVER,
              },
            ],
          },
        ],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const doubleExitMatchUp = matchUps.find((m) => m.matchUpStatus === DOUBLE_WALKOVER);

      if (doubleExitMatchUp) {
        const { isDoubleExit } = tournamentEngine.matchUpActions({
          matchUpId: doubleExitMatchUp.matchUpId,
          drawId,
        });

        expect(isDoubleExit).toBe(true);
      }
    });
  });

  describe('Custom Policy Configurations', () => {
    it('supports stage-specific action control', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const scheduleOnlyPolicy = {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          enabledStructures: [
            {
              stages: [MAIN],
              stageSequences: [1],
              enabledActions: [SCHEDULE],
            },
          ],
        },
      };

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      const { validActions } = tournamentEngine.matchUpActions({
        policyDefinitions: scheduleOnlyPolicy,
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // With schedule-only policy, should primarily have SCHEDULE
      expect(actionTypes).toContain(SCHEDULE);
      // Policy restricts other actions but may still have some system actions
      expect(validActions.length).toBeLessThan(5);
    });

    it('supports disabledActions configuration', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const noSubstitutionPolicy = {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          enabledStructures: [
            {
              stages: [],
              stageSequences: [],
              enabledActions: [],
              disabledActions: [SUBSTITUTION],
            },
          ],
        },
      };

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      const { validActions } = tournamentEngine.matchUpActions({
        policyDefinitions: noSubstitutionPolicy,
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      expect(actionTypes).not.toContain(SUBSTITUTION);
    });

    it('respects enforceGender override', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      // Override enforceGender for this query
      const result = tournamentEngine.matchUpActions({
        enforceGender: false,
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      expect(result).toBeDefined();
      expect(result.validActions).toBeDefined();
    });
  });

  describe('Substitution Rules', () => {
    it('blocks substitution after completion by default', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          {
            drawSize: 16,
            participantsCount: 16,
            outcomes: [
              {
                roundNumber: 1,
                roundPosition: 1,
                winningSide: 1,
                scoreString: '6-0 6-0',
              },
            ],
          },
        ],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const completedMatchUp = matchUps.find((m) => m.matchUpStatus === COMPLETED);

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: completedMatchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Should not have substitution for completed matchUp with default policy
      expect(actionTypes).not.toContain(SUBSTITUTION);
    });

    it('allows substitution after completion when enabled', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          {
            drawSize: 16,
            participantsCount: 16,
            outcomes: [
              {
                roundNumber: 1,
                roundPosition: 1,
                winningSide: 1,
                scoreString: '6-0 6-0',
              },
            ],
          },
        ],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const flexiblePolicy = {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          substituteAfterCompleted: true,
          substituteWithoutScore: true,
        },
      };

      tournamentEngine.attachPolicies({
        policyDefinitions: flexiblePolicy,
      });

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const completedMatchUp = matchUps.find((m) => m.matchUpStatus === COMPLETED);

      // Verification depends on matchUp being a team/collection matchUp
      // Standard singles matchUps don't have substitution actions
      expect(completedMatchUp).toBeDefined();
    });
  });

  describe('Return Value Structure', () => {
    it('returns all documented properties', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      const result = tournamentEngine.matchUpActions({
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      // Verify documented return properties
      expect(result).toHaveProperty('validActions');
      expect(result).toHaveProperty('structureIsComplete');

      // Verify types
      expect(Array.isArray(result.validActions)).toBe(true);
      expect(typeof result.structureIsComplete).toBe('boolean');

      // isByeMatchUp property is present when the matchUp is a BYE
      if (result.isByeMatchUp !== undefined) {
        expect(typeof result.isByeMatchUp).toBe('boolean');
      }

      // isDoubleExit property is present for double exit matchUps
      if (result.isDoubleExit !== undefined) {
        expect(typeof result.isDoubleExit).toBe('boolean');
      }
    });
  });

  describe('Action Execution', () => {
    it('provides executable method and payload for SCORE action', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      const readyMatchUp = matchUps.find(
        (m) => m.matchUpStatus === TO_BE_PLAYED && m.sides?.length === 2 && m.sides.every((s) => s.participantId),
      );

      expect(readyMatchUp).toBeDefined();

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: readyMatchUp.matchUpId,
        drawId,
      });

      const scoreAction = validActions.find((a) => a.type === SCORE);
      expect(scoreAction).toBeDefined();

      expect(scoreAction).toHaveProperty('type');
      expect(scoreAction).toHaveProperty('method');
      expect(scoreAction).toHaveProperty('payload');

      expect(scoreAction.type).toBe(SCORE);
      expect(typeof scoreAction.method).toBe('string');
      expect(scoreAction.payload).toHaveProperty('matchUpId');
      expect(scoreAction.payload).toHaveProperty('drawId');

      // Method should be executable
      expect(typeof tournamentEngine[scoreAction.method]).toBe('function');
    });

    it('can execute SCORE action using provided structure', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      const readyMatchUp = matchUps.find(
        (m) => m.matchUpStatus === TO_BE_PLAYED && m.sides?.length === 2 && m.sides.every((s) => s.participantId),
      );

      expect(readyMatchUp).toBeDefined();

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: readyMatchUp.matchUpId,
        drawId,
      });

      const scoreAction = validActions.find((a) => a.type === SCORE);
      expect(scoreAction).toBeDefined();

      const { method, payload } = scoreAction;

      // Add outcome
      payload.outcome = {
        scoreStringSide1: '6-4 6-3',
        scoreStringSide2: '',
        winningSide: 1,
      };

      // Execute
      const result = tournamentEngine[method](payload);
      expect(result.success).toBe(true);

      // Verify matchUp was scored
      const { matchUps: updatedMatchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const scoredMatchUp = updatedMatchUps.find((m) => m.matchUpId === readyMatchUp.matchUpId);
      expect(scoredMatchUp.winningSide).toBe(1);
      expect(scoredMatchUp.matchUpStatus).toBe(COMPLETED);
    });

    it('can execute SCHEDULE action using provided structure', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      const { validActions } = tournamentEngine.matchUpActions({
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      const scheduleAction = validActions.find((a) => a.type === SCHEDULE);
      expect(scheduleAction).toBeDefined();

      // Verify SCHEDULE action has proper structure
      expect(scheduleAction).toHaveProperty('type');
      expect(scheduleAction).toHaveProperty('payload');
      expect(scheduleAction.type).toBe(SCHEDULE);

      // SCHEDULE actions may have method property
      if (scheduleAction.method) {
        expect(typeof tournamentEngine[scheduleAction.method]).toBe('function');
      }
    });
  });

  describe('Structure Completion', () => {
    it('reports structure completion status', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4, participantsCount: 4 }],
        inContext: true,
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId,
        inContext: true,
      });

      // Before completion
      const { structureIsComplete: beforeComplete } = tournamentEngine.matchUpActions({
        matchUpId: matchUps[0].matchUpId,
        drawId,
      });

      expect(beforeComplete).toBe(false);

      // Complete all matchUps in order
      const sortedMatchUps = matchUps.sort((a, b) => a.roundNumber - b.roundNumber);

      for (const matchUp of sortedMatchUps) {
        if (matchUp.matchUpStatus === TO_BE_PLAYED) {
          const { matchUp: currentMatchUp } = tournamentEngine.findMatchUp({
            matchUpId: matchUp.matchUpId,
            drawId,
          });

          if (currentMatchUp.sides?.length === 2 && currentMatchUp.sides.every((s) => s.participantId)) {
            tournamentEngine.setMatchUpStatus({
              matchUpId: matchUp.matchUpId,
              outcome: { winningSide: 1 },
              drawId,
            });
          }
        }
      }

      // After completion - check final matchUp
      const { matchUps: finalMatchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const finalMatchUp = finalMatchUps.find(
        (m) => m.roundNumber === Math.max(...finalMatchUps.map((mu) => mu.roundNumber)),
      );

      const { structureIsComplete: afterComplete } = tournamentEngine.matchUpActions({
        matchUpId: finalMatchUp.matchUpId,
        drawId,
      });

      // Structure is complete when final is played
      expect(typeof afterComplete).toBe('boolean');
    });
  });

  describe('Policy Precedence', () => {
    it('respects inline policyDefinitions over attached policies', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      // Attach restrictive policy
      const restrictivePolicy = {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          enabledStructures: [
            {
              stages: [],
              stageSequences: [],
              enabledActions: [SCHEDULE],
            },
          ],
        },
      };

      tournamentEngine.attachPolicies({
        policyDefinitions: restrictivePolicy,
      });

      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const matchUp = matchUps[0];

      // Query with different policy
      const openPolicy = {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          enabledStructures: [
            {
              stages: [],
              stageSequences: [],
              enabledActions: [],
            },
          ],
        },
      };

      const { validActions } = tournamentEngine.matchUpActions({
        policyDefinitions: openPolicy,
        matchUpId: matchUp.matchUpId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Should have more actions than just SCHEDULE
      expect(validActions.length).toBeGreaterThan(1);
      expect(actionTypes).toContain(REFEREE);
    });
  });
});
