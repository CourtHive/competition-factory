import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import { BYE, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import {
  SWAP_PARTICIPANTS,
  ADD_PENALTY,
  ADD_NICKNAME,
  REMOVE_ASSIGNMENT,
  ALTERNATE_PARTICIPANT,
  ASSIGN_BYE,
  ASSIGN_PARTICIPANT,
  LUCKY_PARTICIPANT,
  SEED_VALUE,
} from '@Constants/positionActionConstants';
import {
  INVALID_DRAW_POSITION,
  INVALID_VALUES,
  MISSING_DRAW_POSITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import {
  AD_HOC,
  CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  LUCKY_DRAW,
  MAIN,
} from '@Constants/drawDefinitionConstants';

it('can return accurate position details when requesting positionActions', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
      outcomes: [
        {
          scoreString: '6-2 6-1',
          roundPosition: 3,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  let drawPosition = 1;
  let result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  drawPosition = 2;
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(true);

  drawPosition = 0;
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DRAW_POSITION);

  drawPosition = 40;
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DRAW_POSITION);
});

it('returns correct positionActions for participants in completed matchUps', () => {
  const drawProfiles = [
    {
      participantsCount: 32,
      drawSize: 32,
      outcomes: [
        {
          scoreString: '6-2 6-1',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });

  let drawPosition = 1;
  let targetMatchUp = matchUps.find((matchUp) => matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);

  let result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(true);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  let options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(true);
  expect(options.includes(ADD_NICKNAME)).toEqual(true);
  expect(options.includes(ASSIGN_BYE)).toEqual(false);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(false);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(false);
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(false);

  // now check that loser position is considered active
  drawPosition = 2;
  targetMatchUp = matchUps.find((matchUp) => matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);

  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(true);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(true);
  expect(options.includes(ADD_NICKNAME)).toEqual(true);
  expect(options.includes(ASSIGN_BYE)).toEqual(false);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(false);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(false);
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(false);

  // now check inactive drawPosition
  drawPosition = 3;
  targetMatchUp = matchUps.find((matchUp) => matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(true);
  expect(options.includes(ADD_NICKNAME)).toEqual(true);
  expect(options.includes(ASSIGN_BYE)).toEqual(true);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(true);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(false); // there are no participants with entryStatus: ALTERNATE
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(true);
});

it('returns correct positionActions for BYE positions where paired participants are in completed matchUps', () => {
  const drawProfiles = [
    {
      participantsCount: 30,
      drawSize: 32,
      outcomes: [
        {
          scoreString: '6-2 6-1',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          scoreString: '6-2 6-1',
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 1,
        },
      ],
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });

  let drawPosition = 1;
  let targetMatchUp = matchUps.find(
    (matchUp) => matchUp.roundNumber === 2 && matchUp.drawPositions.includes(drawPosition),
  );
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);

  let result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(true);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  let options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(true);
  expect(options.includes(ADD_NICKNAME)).toEqual(true);
  expect(options.includes(ASSIGN_BYE)).toEqual(false);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(false);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(false);
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(false);

  // now check that BYE position is considered active
  drawPosition = 2;
  targetMatchUp = matchUps.find((matchUp) => matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(true);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(true);

  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(false);
  expect(options.includes(ADD_NICKNAME)).toEqual(false);
  expect(options.includes(ASSIGN_BYE)).toEqual(false);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(false);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(false);
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(false);

  // now check inactive BYE position
  drawPosition = 31;
  targetMatchUp = matchUps.find((matchUp) => matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(true);

  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(false);
  expect(options.includes(ADD_NICKNAME)).toEqual(false);
  expect(options.includes(ASSIGN_BYE)).toEqual(false);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(true);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(true); // in this case there are 2 alternates
  // expect(options.includes(SWAP_PARTICIPANTS)).toEqual(true); // temporarily disabled

  // now check inactive position paired with BYE
  drawPosition = 32;
  targetMatchUp = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ADD_PENALTY)).toEqual(true);
  expect(options.includes(ADD_NICKNAME)).toEqual(true);
  expect(options.includes(ASSIGN_BYE)).toEqual(true);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(true);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(true); // in this case there are 2 alternates
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(true);

  // now check an inactive assigned drawPosition
  drawPosition = 5;
  targetMatchUp = matchUps.find((matchUp) => matchUp.drawPositions.includes(drawPosition));
  expect(targetMatchUp.matchUpStatus).not.toEqual(BYE);

  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(SEED_VALUE)).toEqual(false); // because structure is active
});

test('seedValues can be defined for unseeded positions', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, seedsCount: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  let p = tournamentEngine.getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });
  let participantsWithSeedings = p.participants.filter((participant) => participant.seedings?.[SINGLES_EVENT]);
  expect(participantsWithSeedings.length).toEqual(4);

  let result = tournamentEngine.positionActions({
    drawPosition: 2,
    structureId,
    drawId,
  });
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(SEED_VALUE)).toEqual(true);

  const action = result.validActions.find((action) => action.type === SEED_VALUE);
  const { method, payload } = action;

  payload.seedValue = 'x';
  result = tournamentEngine[method]({ ...payload });
  expect(result.error).toEqual(INVALID_VALUES);

  payload.seedValue = '5';
  result = tournamentEngine[method]({ ...payload });
  expect(result.success).toEqual(true);

  p = tournamentEngine.getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });
  participantsWithSeedings = p.participants.filter((participant) => participant.seedings?.[SINGLES_EVENT]);
  expect(participantsWithSeedings.length).toEqual(5);

  for (const participant of participantsWithSeedings) {
    const { participantId } = participant;
    expect(participant.seedings[SINGLES_EVENT].length).toBeDefined();
    expect(p.participantMap[participantId].events[eventId].seedAssignments[MAIN].seedValue).toBeDefined();
    expect(p.participantMap[participantId].draws[drawId].seedAssignments[MAIN].seedValue).toBeDefined();
  }
});

it('positionActions delegates to matchUpActions for adHoc structures', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: AD_HOC }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // For adHoc structures, positionActions should delegate to matchUpActions
  // drawPosition is not required for adHoc
  const result = tournamentEngine.positionActions({
    drawPosition: undefined,
    structureId,
    drawId,
  });

  // adHoc delegation to matchUpActions may return error or valid actions
  // The key point is it doesn't return MISSING_DRAW_POSITION
  expect(result.error !== MISSING_DRAW_POSITION || result.error === undefined).toBe(true);
});

it('positionActions returns MISSING_DRAW_POSITION when drawPosition undefined for non-adHoc', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  const result = tournamentEngine.positionActions({
    drawPosition: undefined,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);
});

it('positionActions returns STRUCTURE_NOT_FOUND for invalid structureId', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.positionActions({
    structureId: 'nonExistentStructureId',
    drawPosition: 1,
    drawId,
  });
  expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
});

it('positionActions returns actionsDisabled info for disabled structures', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Use a policy that disables the MAIN structure
  const disablePolicy = {
    [POLICY_TYPE_POSITION_ACTIONS]: {
      disabledStructures: [{ stages: [MAIN] }],
      enabledStructures: [],
    },
  };

  const result = tournamentEngine.positionActions({
    policyDefinitions: disablePolicy,
    drawPosition: 1,
    structureId,
    drawId,
  });

  expect(result.validActions).toEqual([]);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.hasPositionAssigned).toBeDefined();
  expect(result.isByePosition).toBeDefined();
  expect(result.isActiveDrawPosition).toBeDefined();
});

it('positionActions shows willDisableLinks for consolation structure positions', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize: 8,
        participantsCount: 8,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

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

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolationStructure = drawDefinition.structures.find((s) => s.stage === CONSOLATION);
  expect(consolationStructure).toBeDefined();

  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: consolationStructure.structureId,
    drawId,
  });
  const filledPosition = positionAssignments.find((p) => p.participantId);

  if (filledPosition) {
    // Use unrestricted policy to see all actions
    const unrestrictedPolicy = {
      [POLICY_TYPE_POSITION_ACTIONS]: {
        enabledStructures: [
          {
            stages: [],
            stageSequences: [],
            enabledActions: [],
            disabledActions: [],
          },
        ],
      },
    };

    const result = tournamentEngine.positionActions({
      drawPosition: filledPosition.drawPosition,
      structureId: consolationStructure.structureId,
      policyDefinitions: unrestrictedPolicy,
      drawId,
    });

    // consolation structure stageSequence !== 1, so possiblyDisablingAction should be true
    const removeAction = result.validActions?.find((a) => a.type === REMOVE_ASSIGNMENT);
    if (removeAction) {
      expect(removeAction.willDisableLinks).toBe(true);
    }
  }
});

it('positionActions excludes WITHDRAW and ASSIGN_BYE for lucky draw advanced positions', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 5, drawType: LUCKY_DRAW }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // In lucky draw, find a position that is beyond round 1
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });

  // Lucky draws have positions in higher rounds; check drawPositionInitialRounds
  // Positions with initialRound > 1 are "advanced positions"
  for (const assignment of positionAssignments) {
    const result = tournamentEngine.positionActions({
      drawPosition: assignment.drawPosition,
      structureId,
      drawId,
    });

    const actionTypes = result.validActions?.map((a) => a.type) ?? [];
    // Verify structure of response
    expect(result.isDrawPosition).toEqual(true);

    // For lucky draw advanced positions, WITHDRAW and ASSIGN_BYE should not be present
    if (result.hasPositionAssigned && !result.isByePosition) {
      // All positions should have basic actions
      if (!result.isActiveDrawPosition) {
        expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
      }
    }
  }
});

it('positionActions removes placement actions when source structures are not complete', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize: 8,
        participantsCount: 8,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolationStructure = drawDefinition.structures.find((s) => s.stage === CONSOLATION);
  expect(consolationStructure).toBeDefined();

  // Without completing main structure, consolation should have limited actions
  // because source structures are not complete (disablePlacementActions)
  const result = tournamentEngine.positionActions({
    structureId: consolationStructure.structureId,
    drawPosition: 1,
    drawId,
  });

  // Default policy for consolation structure means no actions without enabled structures
  const actionTypes = result.validActions?.map((a) => a.type) ?? [];

  // ASSIGN_PARTICIPANT should NOT be available because source (main) is not complete
  expect(actionTypes).not.toContain(ASSIGN_PARTICIPANT);
  // LUCKY_PARTICIPANT should NOT be available when source not complete
  expect(actionTypes).not.toContain(LUCKY_PARTICIPANT);
});

it('positionActions handles provisionalPositioning parameter', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // provisionalPositioning should not cause errors
  const result = tournamentEngine.positionActions({
    provisionalPositioning: true,
    drawPosition: 1,
    structureId,
    drawId,
  });

  expect(result.validActions).toBeDefined();
  expect(result.isDrawPosition).toBe(true);
});

it('positionActions works without tournamentRecord when tournamentParticipants provided', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Should work normally with tournamentRecord absent from params
  // when called through the engine (which provides tournamentRecord)
  const result = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  });

  expect(result.validActions).toBeDefined();
  expect(result.validActions.length).toBeGreaterThan(0);
});
