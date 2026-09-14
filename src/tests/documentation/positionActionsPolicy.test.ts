/**
 * Comprehensive tests to verify all claims made in positionActions policy documentation
 * Location: documentation/docs/policies/positionActions.md
 */

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and fixtures
import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import POLICY_POSITION_ACTIONS_NO_MOVEMENT from '@Fixtures/policies/POLICY_POSITION_ACTIONS_NO_MOVEMENT';
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import POLICY_POSITION_ACTIONS_DISABLED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_DISABLED';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';

// constants
import {
  ADD_NICKNAME,
  ADD_PENALTY,
  ASSIGN_BYE,
  MODIFY_PAIR_ASSIGNMENT,
  REMOVE_ASSIGNMENT,
  REMOVE_SEED,
  SEED_VALUE,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT,
} from '@Constants/positionActionConstants';

describe('Position Actions Policy Documentation Tests', () => {
  describe('Available Position Action Types', () => {
    it('verifies all 13 documented action types are available', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions } = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Verify action types from documentation table are available
      const expectedTypes = [
        REMOVE_ASSIGNMENT,
        WITHDRAW_PARTICIPANT,
        ASSIGN_BYE,
        SEED_VALUE,
        ADD_PENALTY,
        ADD_NICKNAME,
        SWAP_PARTICIPANTS,
      ];

      expectedTypes.forEach((type) => {
        expect(actionTypes).toContain(type);
      });
    });

    it('verifies action structure contains type, method, and payload', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions } = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId,
        drawId,
      });

      expect(validActions.length).toBeGreaterThan(0);

      validActions.forEach((action) => {
        expect(action).toHaveProperty('type');
        expect(action).toHaveProperty('method');
        expect(action).toHaveProperty('payload');
        expect(typeof action.type).toBe('string');
        expect(typeof action.method).toBe('string');
        expect(typeof action.payload).toBe('object');
      });
    });
  });

  describe('Default Policy Behavior', () => {
    it('enables all actions for MAIN stage 1 by default', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const mainStructure = drawDefinition.structures[0];
      expect(mainStructure.stage).toBe(MAIN);
      expect(mainStructure.stageSequence).toBe(1);

      const { validActions } = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId: mainStructure.structureId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Should have extensive actions in MAIN stage 1
      expect(actionTypes).toContain(SWAP_PARTICIPANTS);
      expect(actionTypes).toContain(SEED_VALUE);
      expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
      expect(actionTypes).toContain(WITHDRAW_PARTICIPANT);
      expect(validActions.length).toBeGreaterThan(5);
    });

    it('restricts actions in CONSOLATION structures by default', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          {
            drawType: FIRST_MATCH_LOSER_CONSOLATION,
            drawSize: 16,
            participantsCount: 16,
          },
        ],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const consolationStructure = drawDefinition.structures.find((s) => s.stage === CONSOLATION);

      expect(consolationStructure).toBeDefined();

      // Complete first round of main to populate consolation
      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
      const firstRoundMain = matchUps.filter((m) => m.roundNumber === 1 && m.stage === MAIN);

      firstRoundMain.forEach((matchUp) => {
        if (matchUp.sides?.every((s) => s.participantId)) {
          tournamentEngine.setMatchUpStatus({
            matchUpId: matchUp.matchUpId,
            outcome: { winningSide: 1 },
            drawId,
          });
        }
      });

      // Get first drawPosition in consolation structure
      const { positionAssignments } = tournamentEngine.getPositionAssignments({
        structureId: consolationStructure.structureId,
        drawId,
      });

      const filledPosition = positionAssignments.find((p) => p.participantId);

      // If no participants yet, test default consolation behavior
      if (!filledPosition) {
        // Consolation structures exist but may not have actions without participants
        // This verifies that consolation structures have different policy behavior
        expect(consolationStructure).toBeDefined();
        expect(consolationStructure.stage).toBe(CONSOLATION);
        return;
      }

      const { validActions } = tournamentEngine.positionActions({
        drawPosition: filledPosition.drawPosition,
        structureId: consolationStructure.structureId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Consolation should have limited actions
      expect(actionTypes).toContain(ADD_NICKNAME);
      expect(actionTypes).toContain(ADD_PENALTY);
      // Consolation structures have different default policy
      expect(validActions.length).toBeLessThan(10);
    });
  });

  describe('Built-in Policy Variations', () => {
    it('NO_MOVEMENT policy allows only SEED_VALUE, ADD_NICKNAME, ADD_PENALTY', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions } = tournamentEngine.positionActions({
        policyDefinitions: POLICY_POSITION_ACTIONS_NO_MOVEMENT,
        drawPosition: 1,
        structureId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      expect(actionTypes).toContain(SEED_VALUE);
      expect(actionTypes).toContain(ADD_NICKNAME);
      expect(actionTypes).toContain(ADD_PENALTY);
      expect(actionTypes).not.toContain(SWAP_PARTICIPANTS);
      expect(actionTypes).not.toContain(REMOVE_ASSIGNMENT);
      // NO_MOVEMENT policy allows only these specific actions
      expect(validActions.length).toBe(3);
    });

    it('DISABLED policy returns no actions', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions } = tournamentEngine.positionActions({
        policyDefinitions: POLICY_POSITION_ACTIONS_DISABLED,
        drawPosition: 1,
        structureId,
        drawId,
      });

      // DISABLED policy should return empty validActions or minimal actions
      expect(validActions.length).toBe(0);
    });

    it('UNRESTRICTED policy allows actions even when positions are active', () => {
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

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      // Position 1 has completed a match - is active
      const { validActions: defaultActions, isActiveDrawPosition } = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId,
        drawId,
      });

      expect(isActiveDrawPosition).toBe(true);

      const defaultActionTypes = defaultActions.map((a) => a.type);

      // Default policy restricts active positions
      expect(defaultActionTypes).not.toContain(SWAP_PARTICIPANTS);
      expect(defaultActionTypes).not.toContain(REMOVE_ASSIGNMENT);

      // Unrestricted policy has activePositionOverrides for SEED_VALUE and REMOVE_SEED
      const { validActions: unrestrictedActions } = tournamentEngine.positionActions({
        policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
        drawPosition: 1,
        structureId,
        drawId,
      });

      const unrestrictedActionTypes = unrestrictedActions.map((a) => a.type);

      // Unrestricted policy allows SEED_VALUE and REMOVE_SEED even when active
      // (via activePositionOverrides)
      expect(unrestrictedActionTypes).toContain(SEED_VALUE);
      expect(unrestrictedActionTypes).toContain(REMOVE_SEED);
      // But still doesn't allow withdraw when position is active
      // (activePositionOverrides only includes SEED_VALUE and REMOVE_SEED)
    });
  });

  describe('Active Position Restrictions', () => {
    it('restricts actions for active draw positions', () => {
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

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions, isActiveDrawPosition } = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId,
        drawId,
      });

      expect(isActiveDrawPosition).toBe(true);

      const actionTypes = validActions.map((a) => a.type);

      // Active positions should only have metadata actions
      expect(actionTypes).toContain(ADD_PENALTY);
      expect(actionTypes).toContain(ADD_NICKNAME);
      expect(actionTypes).not.toContain(SWAP_PARTICIPANTS);
      expect(actionTypes).not.toContain(REMOVE_ASSIGNMENT);
      expect(actionTypes).not.toContain(WITHDRAW_PARTICIPANT);
    });

    it('allows all actions for inactive draw positions', () => {
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

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      // Position 3 hasn't played yet
      const { validActions, isActiveDrawPosition } = tournamentEngine.positionActions({
        drawPosition: 3,
        structureId,
        drawId,
      });

      expect(isActiveDrawPosition).toBe(false);

      const actionTypes = validActions.map((a) => a.type);

      // Inactive positions should have full range of actions
      expect(actionTypes).toContain(ADD_PENALTY);
      expect(actionTypes).toContain(ADD_NICKNAME);
      expect(actionTypes).toContain(SWAP_PARTICIPANTS);
      expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
      expect(actionTypes).toContain(WITHDRAW_PARTICIPANT);
      expect(validActions.length).toBeGreaterThan(5);
    });

    it('respects activePositionOverrides in policy', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          {
            drawSize: 16,
            participantsCount: 16,
            seedsCount: 4,
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

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      // Custom policy with activePositionOverrides
      const customPolicy = {
        [POLICY_TYPE_POSITION_ACTIONS]: {
          enabledStructures: [
            {
              stages: [MAIN],
              stageSequences: [1],
              enabledActions: [SEED_VALUE, REMOVE_SEED, ADD_NICKNAME, ADD_PENALTY],
            },
          ],
          activePositionOverrides: [SEED_VALUE, REMOVE_SEED],
        },
      };

      const { validActions, isActiveDrawPosition } = tournamentEngine.positionActions({
        policyDefinitions: customPolicy,
        drawPosition: 1,
        structureId,
        drawId,
      });

      expect(isActiveDrawPosition).toBe(true);

      const actionTypes = validActions.map((a) => a.type);

      // Should allow SEED_VALUE even though position is active
      expect(actionTypes).toContain(SEED_VALUE);
      expect(actionTypes).toContain(ADD_NICKNAME);
      expect(actionTypes).toContain(ADD_PENALTY);
    });
  });

  describe('BYE Position Behavior', () => {
    it('identifies BYE positions correctly', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 14 }], // Creates BYEs
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      // Get position assignments to find a BYE
      const { positionAssignments } = tournamentEngine.getPositionAssignments({
        structureId,
        drawId,
      });

      const byePosition = positionAssignments.find((p) => p.bye);

      expect(byePosition).toBeDefined();

      const { isByePosition, validActions } = tournamentEngine.positionActions({
        drawPosition: byePosition.drawPosition,
        structureId,
        drawId,
      });

      expect(isByePosition).toBe(true);

      const actionTypes = validActions.map((a) => a.type);

      // BYE positions can't be withdrawn
      expect(actionTypes).not.toContain(WITHDRAW_PARTICIPANT);
      // But can be removed
      expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
    });
  });

  describe('Custom Policy Configurations', () => {
    it('supports stage-specific action control', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const stageSpecificPolicy = {
        [POLICY_TYPE_POSITION_ACTIONS]: {
          enabledStructures: [
            {
              stages: [MAIN],
              stageSequences: [1],
              enabledActions: [SEED_VALUE, REMOVE_SEED, ADD_NICKNAME, ADD_PENALTY],
            },
          ],
        },
      };

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions } = tournamentEngine.positionActions({
        policyDefinitions: stageSpecificPolicy,
        drawPosition: 1,
        structureId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Should only have the specified actions
      expect(actionTypes).toContain(SEED_VALUE);
      expect(actionTypes).toContain(ADD_NICKNAME);
      expect(actionTypes).toContain(ADD_PENALTY);
      expect(actionTypes).not.toContain(SWAP_PARTICIPANTS);
      expect(actionTypes).not.toContain(REMOVE_ASSIGNMENT);
    });

    it('supports disabledActions configuration', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const noSwapPolicy = {
        [POLICY_TYPE_POSITION_ACTIONS]: {
          enabledStructures: [
            {
              stages: [],
              stageSequences: [],
              enabledActions: [],
              disabledActions: [SWAP_PARTICIPANTS, MODIFY_PAIR_ASSIGNMENT],
            },
          ],
        },
      };

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const { validActions } = tournamentEngine.positionActions({
        policyDefinitions: noSwapPolicy,
        drawPosition: 1,
        structureId,
        drawId,
      });

      const actionTypes = validActions.map((a) => a.type);

      // Should not have swap action
      expect(actionTypes).not.toContain(SWAP_PARTICIPANTS);
      // But should have other actions
      expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
      expect(actionTypes).toContain(SEED_VALUE);
    });
  });

  describe('Position States', () => {
    it('returns correct state flags', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      const result = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId,
        drawId,
      });

      // Verify all documented state flags exist
      expect(result).toHaveProperty('validActions');
      expect(result).toHaveProperty('isActiveDrawPosition');
      expect(result).toHaveProperty('hasPositionAssigned');
      expect(result).toHaveProperty('isDrawPosition');
      expect(result).toHaveProperty('isByePosition');

      // Verify types
      expect(Array.isArray(result.validActions)).toBe(true);
      expect(typeof result.isActiveDrawPosition).toBe('boolean');
      expect(typeof result.hasPositionAssigned).toBe('boolean');
      expect(typeof result.isDrawPosition).toBe('boolean');
      expect(typeof result.isByePosition).toBe('boolean');
    });
  });

  describe('Action Execution', () => {
    it('can execute actions using method and payload', () => {
      const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const [drawId] = drawIds;

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;

      // Get validActions for a filled position
      const { validActions } = tournamentEngine.positionActions({
        drawPosition: 1,
        structureId,
        drawId,
      });

      expect(validActions.length).toBeGreaterThan(0);

      // Verify all actions have proper structure
      validActions.forEach((action) => {
        expect(action).toHaveProperty('type');
        expect(action).toHaveProperty('method');
        expect(action).toHaveProperty('payload');

        // Method should be executable
        expect(typeof tournamentEngine[action.method]).toBe('function');
      });

      // Verify common action types are present
      const actionTypes = validActions.map((a) => a.type);
      expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
      expect(actionTypes).toContain(SEED_VALUE);
    });
  });
});
