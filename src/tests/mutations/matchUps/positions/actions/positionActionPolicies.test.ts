import { getParticipantIds } from '@Functions/global/extractors';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants, fixtures and types
import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import POLICY_POSITION_ACTIONS_NO_MOVEMENT from '@Fixtures/policies/POLICY_POSITION_ACTIONS_NO_MOVEMENT';
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import POLICY_POSITION_ACTIONS_DISABLED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_DISABLED';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import {
  EXISTING_POLICY_TYPE,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITION,
  MISSING_EVENT,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import {
  ADD_NICKNAME,
  ADD_PENALTY,
  ALTERNATE_PARTICIPANT,
  ASSIGN_BYE,
  REMOVE_ASSIGNMENT,
  REMOVE_SEED,
  SEED_VALUE,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT,
} from '@Constants/positionActionConstants';

// demonstrates that policyDefinitions can be used to change the behavior of positionActions
it('supports policyDefinitions in positionActions', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 30,
      drawSize: 32,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

  const allActions = [
    REMOVE_ASSIGNMENT,
    WITHDRAW_PARTICIPANT,
    ASSIGN_BYE,
    SEED_VALUE,
    REMOVE_SEED,
    ADD_PENALTY,
    ADD_NICKNAME,
    SWAP_PARTICIPANTS,
    ALTERNATE_PARTICIPANT,
  ];
  const noMovementActions = [SEED_VALUE, ADD_PENALTY, ADD_NICKNAME];

  // will be testing the available positionActions for { drawPosition: 3 }
  // initially in mainStructure followed by consolationStructure
  const drawPosition = 3;

  // default configuration should return all validActions
  let result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.validActions.map((a) => a.type)).toEqual(allActions);

  // policyDefinitions to disable all actions
  let policyDefinitions: any = POLICY_POSITION_ACTIONS_DISABLED;
  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    policyDefinitions,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toEqual(0);

  // policyDefinitions to only allow actions not related to movement
  // the three actions below are specifically enabled by the policy
  policyDefinitions = POLICY_POSITION_ACTIONS_NO_MOVEMENT;
  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    policyDefinitions,
    drawPosition,
    drawId,
  });
  expect(result.validActions.map(({ type }) => type)).toEqual(noMovementActions);

  // now check the available positionActions for the consolation structure
  result = tournamentEngine.positionActions({
    structureId: consolationStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toEqual(0);

  let contextFilters = { stages: [MAIN] };
  let { upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  });

  const firstRoundMain = upcomingMatchUps.filter(({ roundNumber }) => roundNumber === 1);

  firstRoundMain.forEach(({ matchUpId }) => {
    const result = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { winningSide: 1 },
    });
    expect(result.success).toEqual(true);
  });

  // since all first round matchUps have been completed...
  // ...validActions for activeDrawPositions should be restricted; no partcipant movement
  result = tournamentEngine.positionActions({
    drawId,
    structureId: mainStructure.structureId,
    drawPosition,
  });
  expect(result.isActiveDrawPosition).toEqual(true);
  expect(result.validActions.map(({ type }) => type)).toEqual([ADD_PENALTY, ADD_NICKNAME]);

  contextFilters = { stages: [CONSOLATION] };
  ({ upcomingMatchUps } = tournamentEngine.tournamentMatchUps({
    contextFilters,
  }));
  const firstRoundConsolation = upcomingMatchUps.filter(({ roundNumber }) => roundNumber === 1);
  // every firstRoundConsolation matchUp should be readyToScore...
  // ...which means each matchUp must have participantsAssigned
  expect(firstRoundConsolation.every(({ readyToScore }) => readyToScore)).toEqual(true);

  const firstRoundConsolationDrawPositions = firstRoundConsolation.map(({ drawPositions }) => drawPositions).flat();

  // now check the available positionActions for the consolation structure when participants are present
  result = tournamentEngine.positionActions({
    drawPosition: firstRoundConsolationDrawPositions[0],
    structureId: consolationStructure.structureId,
    drawId,
  });
  expect(result.hasPositionAssigned).toEqual(true);
  expect(result.validActions.map(({ type }) => type)).toEqual([ADD_PENALTY, ADD_NICKNAME]);

  // now check the available positionActions for the consolation structure when participants are present
  // ...when an unrestricted policyDefinitions is applied
  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: consolationStructure.structureId,
    drawPosition: firstRoundConsolationDrawPositions[0],
    drawId,
  });
  expect(result.validActions.map((a) => a.type)).toEqual([
    REMOVE_ASSIGNMENT,
    WITHDRAW_PARTICIPANT,
    ASSIGN_BYE,
    ADD_PENALTY,
    ADD_NICKNAME,
    SWAP_PARTICIPANTS,
    ALTERNATE_PARTICIPANT,
  ]);
});

it('can disable actions for a specified structure', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      seedsCount: 2,
      drawSize: 8,
    },
  ];

  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  let {
    drawDefinition: {
      structures: [mainStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  let seedParticipantIds = getParticipantIds(mainStructure.seedAssignments);
  expect(seedParticipantIds.length).toEqual(2);

  let result = tournamentEngine.assignSeedPositions({
    assignments: [{ seedNumber: 1, seedValue: '1', participantId: undefined }],
    structureId: mainStructure.structureId,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  let consolationStructure;
  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  seedParticipantIds = getParticipantIds(mainStructure.seedAssignments);
  expect(seedParticipantIds.length).toEqual(1);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [mainStructure.structureId] },
  });

  for (const matchUp of matchUps.sort(matchUpSort)) {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpStatusProfile: {},
    });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // will be testing the available positionActions for { drawPosition: 4 }
  // initially in mainStructure followed by consolationStructure
  const drawPosition = 4;

  // default configuration should return all validActions
  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawPosition,
  });
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawPosition,
    eventId,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);

  result = tournamentEngine.positionActions({
    drawPosition,
    drawId,
  });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = tournamentEngine.positionActions({
    structureId: 'bogusId',
    drawPosition,
    drawId,
  });
  expect(result.error).toEqual(STRUCTURE_NOT_FOUND);

  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);

  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toBeGreaterThan(0);

  let validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(ADD_PENALTY)).toEqual(true);
  expect(validActionTypes.includes(ADD_NICKNAME)).toEqual(true);

  // default configuration should return all validActions
  result = tournamentEngine.positionActions({
    structureId: consolationStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toBeGreaterThan(0);

  let policyDefinitions: any = {
    [POLICY_TYPE_POSITION_ACTIONS]: {
      disabledStructures: [{ stages: [CONSOLATION] }],
      enabledStructures: [
        {
          stages: [MAIN], // stages to which this policy applies
          stageSequences: [1], // stageSequences to which this policy applies
          enabledActions: [], // enabledActions: [] => all actions are enabled
          disabledActions: [ADD_PENALTY], // disabledActions: [] => no actions are disabled
        },
      ],
    },
  };

  tournamentEngine.attachPolicies({ policyDefinitions });

  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toBeGreaterThan(0);
  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(ADD_PENALTY)).toEqual(false);
  expect(validActionTypes.includes(ADD_NICKNAME)).toEqual(true);

  result = tournamentEngine.positionActions({
    structureId: consolationStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toEqual(0);

  policyDefinitions = {
    [POLICY_TYPE_POSITION_ACTIONS]: {
      disabledStructures: [{ stages: [CONSOLATION] }],
      enabledStructures: [
        {
          stages: [MAIN], // stages to which this policy applies
          stageSequences: [1], // stageSequences to which this policy applies
          enabledActions: [SEED_VALUE], // enabledActions: [] => all actions are enabled
          disabledActions: [], // disabledActions: [] => no actions are disabled
        },
      ],
    },
  };

  result = tournamentEngine.attachPolicies({ policyDefinitions });
  expect(result.error).toEqual(EXISTING_POLICY_TYPE);

  result = tournamentEngine.attachPolicies({
    allowReplacement: true,
    policyDefinitions,
  });
  expect(result.applied.length).toEqual(1);

  result = tournamentEngine.positionActions({
    structureId: mainStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toEqual(0);
  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(ADD_PENALTY)).toEqual(false);
});
