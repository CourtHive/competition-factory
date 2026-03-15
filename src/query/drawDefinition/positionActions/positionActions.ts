import { getSourceStructureIdsAndRelevantLinks } from '@Query/structure/getSourceStructureIdsAndRelevantLinks';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { getValidModifyAssignedPairAction } from './getValidModifyAssignedPairAction';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { matchUpActions } from '@Query/drawDefinition/matchUpActions/matchUpActions';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getValidLuckyLosersAction } from './getValidLuckyLoserAction';
import { getValidAlternatesAction } from './getValidAlternatesAction';
import { isValidSeedPosition } from '@Query/drawDefinition/seedGetter';
import { getParticipants } from '@Query/participants/getParticipants';
import { getValidAssignmentActions } from './participantAssignments';
import { getValidQualifiersAction } from './getValidQualifiersAction';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { getValidSwapAction } from './getValidSwapAction';
import { findStructure } from '@Acquire/findStructure';
import {
  activePositionsCheck,
  getEnabledStructures,
  getPolicyActions,
  isAvailableAction,
  POSITION_ACTION,
} from './actionPolicyUtils';

// constants and types
import { INVALID_DRAW_POSITION, MISSING_DRAW_POSITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { CONSOLATION, MAIN, POSITION, QUALIFYING, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, Event, Participant, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  ADD_NICKNAME_METHOD,
  ADD_NICKNAME,
  ADD_PENALTY_METHOD,
  ADD_PENALTY,
  ALTERNATE_PARTICIPANT,
  ASSIGN_BYE,
  ASSIGN_PARTICIPANT,
  LUCKY_PARTICIPANT,
  REMOVE_ASSIGNMENT_METHOD,
  REMOVE_ASSIGNMENT,
  SEED_VALUE_METHOD,
  SEED_VALUE,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT_METHOD,
  WITHDRAW_PARTICIPANT,
  QUALIFYING_PARTICIPANT,
  MODIFY_PAIR_ASSIGNMENT,
  REMOVE_SEED,
  REMOVE_SEED_METHOD,
} from '@Constants/positionActionConstants';

type PositionActionsArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  restrictAdHocRoundParticipants?: boolean;
  tournamentParticipants?: Participant[];
  policyDefinitions?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  returnParticipants?: boolean;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
  structureId: string;
  matchUpId?: string;
  event?: Event;
};

/**
 * Calculates the valid actions for a draw position based on the provided parameters.
 */
// Helper functions to reduce complexity
function getUnassignedParticipantIds(stageEntries, stageAssignedParticipantIds) {
  return stageEntries
    .filter((entry) => !stageAssignedParticipantIds.includes(entry.participantId))
    .map((entry) => entry.participantId);
}

function addAssignmentActions({
  validActions,
  policyActions,
  isActiveDrawPosition,
  positionAssignments,
  disablePlacementActions,
  positionAssignment,
  isByePosition,
  getValidAssignmentActions,
  positionSourceStructureIds,
  unassignedParticipantIds,
  possiblyDisablingAction,
  isWinRatioFedStructure,
  tournamentParticipants,
  returnParticipants,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  event,
}) {
  if (
    isAvailableAction({ policyActions, action: ASSIGN_PARTICIPANT }) &&
    !isActiveDrawPosition &&
    positionAssignments &&
    !disablePlacementActions &&
    (!positionAssignment || isByePosition)
  ) {
    const { validAssignmentActions } = getValidAssignmentActions({
      positionSourceStructureIds,
      unassignedParticipantIds,
      possiblyDisablingAction,
      isWinRatioFedStructure,
      tournamentParticipants,
      positionAssignments,
      returnParticipants,
      appliedPolicies,
      drawDefinition,
      isByePosition,
      drawPosition,
      structureId,
      event,
    });
    validAssignmentActions?.forEach((action) => validActions.push(action));
  }
}

function addQualifyingActions({
  validActions,
  policyActions,
  isActiveDrawPosition,
  getValidQualifiersAction,
  drawPositionInitialRounds,
  tournamentParticipants,
  positionAssignments,
  returnParticipants,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  drawId,
}) {
  if (isAvailableAction({ policyActions, action: QUALIFYING_PARTICIPANT }) && !isActiveDrawPosition) {
    const { validAssignmentActions } = getValidQualifiersAction({
      drawPositionInitialRounds,
      tournamentParticipants,
      positionAssignments,
      returnParticipants,
      appliedPolicies,
      drawDefinition,
      drawPosition,
      structureId,
      drawId,
    });
    validAssignmentActions?.forEach((action) => validActions.push(action));
  }
}

function addRemoveAssignmentActions({
  isLuckyDrawAdvancedPosition,
  validActions,
  policyActions,
  isActiveDrawPosition,
  drawId,
  structureId,
  drawPosition,
  possiblyDisablingAction,
  isByePosition,
}) {
  if (isAvailableAction({ policyActions, action: REMOVE_ASSIGNMENT }) && !isActiveDrawPosition) {
    validActions.push({
      type: REMOVE_ASSIGNMENT,
      method: REMOVE_ASSIGNMENT_METHOD,
      payload: { drawId, structureId, drawPosition },
      willDisableLinks: possiblyDisablingAction,
    });

    if (!isByePosition && !isLuckyDrawAdvancedPosition) {
      validActions.push({
        type: WITHDRAW_PARTICIPANT,
        method: WITHDRAW_PARTICIPANT_METHOD,
        payload: { drawId, structureId, drawPosition },
        willDisableLinks: possiblyDisablingAction,
      });
    }

    if (isAvailableAction({ policyActions, action: ASSIGN_BYE }) && !isByePosition && !isLuckyDrawAdvancedPosition) {
      validActions.push({
        type: ASSIGN_BYE,
        method: REMOVE_ASSIGNMENT_METHOD,
        payload: { drawId, structureId, drawPosition, replaceWithBye: true },
        willDisableLinks: possiblyDisablingAction,
      });
    }
  }
}

function addSeedActions({
  validActions,
  policyActions,
  activePositionsCheck,
  activePositionOverrides,
  activeDrawPositions,
  drawDefinition,
  structureId,
  drawPosition,
  structure,
  isByePosition,
  participantId,
  participant,
  drawId,
}) {
  const validToAssignSeed =
    structure.stage === QUALIFYING || (structure.stage === MAIN && structure.stageSequence === 1);

  if (
    !isByePosition &&
    activePositionsCheck({
      activePositionOverrides,
      activeDrawPositions,
      action: SEED_VALUE,
    }) &&
    isAvailableAction({ policyActions, action: SEED_VALUE }) &&
    isValidSeedPosition({ drawDefinition, structureId, drawPosition }) &&
    validToAssignSeed
  ) {
    const { seedAssignments } = getStructureSeedAssignments({
      returnAllProxies: true,
      drawDefinition,
      structure,
    });
    const { seedNumber, seedValue } =
      seedAssignments?.find((assignment) => assignment.participantId === participantId) ?? {};

    validActions.push({
      type: SEED_VALUE,
      method: SEED_VALUE_METHOD,
      participant,
      seedNumber,
      payload: {
        drawId,
        structureId,
        participantId,
        seedValue,
      },
    });
  }

  if (
    !isByePosition &&
    activePositionsCheck({
      activePositionOverrides,
      activeDrawPositions,
      action: REMOVE_SEED,
    }) &&
    isAvailableAction({ policyActions, action: REMOVE_SEED }) &&
    isValidSeedPosition({ drawDefinition, structureId, drawPosition }) &&
    validToAssignSeed
  ) {
    const { seedAssignments } = getStructureSeedAssignments({
      returnAllProxies: true,
      drawDefinition,
      structure,
    });
    const { seedNumber } = seedAssignments?.find((assignment) => assignment.participantId === participantId) ?? {};

    validActions.push({
      method: REMOVE_SEED_METHOD,
      type: REMOVE_SEED,
      participant,
      seedNumber,
      payload: {
        participantId,
        structureId,
        drawId,
      },
    });
  }
}

function addPenaltyAndNicknameActions({
  validActions,
  policyActions,
  isByePosition,
  participantId,
  participant,
  drawId,
}) {
  if (!isByePosition && participantId) {
    if (isAvailableAction({ policyActions, action: ADD_PENALTY })) {
      const addPenaltyAction = {
        type: ADD_PENALTY,
        method: ADD_PENALTY_METHOD,
        participant,
        payload: {
          penaltyCode: undefined,
          penaltyType: undefined,
          participantIds: [],
          notes: undefined,
          drawId,
        },
      };
      validActions.push(addPenaltyAction);
    }
    if (isAvailableAction({ policyActions, action: ADD_NICKNAME })) {
      const addNicknameAction = {
        type: ADD_NICKNAME,
        method: ADD_NICKNAME_METHOD,
        participant,
        payload: {
          participantId,
          otherName: undefined,
        },
      };
      validActions.push(addNicknameAction);
    }
  }
}

function addSwapAction({
  validActions,
  policyActions,
  getValidSwapAction,
  possiblyDisablingAction,
  tournamentParticipants,
  inactiveDrawPositions,
  activeDrawPositions,
  positionAssignments,
  returnParticipants,
  byeDrawPositions,
  drawDefinition,
  isByePosition,
  drawPosition,
  structureId,
  structure,
  drawId,
}) {
  if (isAvailableAction({ policyActions, action: SWAP_PARTICIPANTS })) {
    const { validSwapAction } = getValidSwapAction({
      possiblyDisablingAction,
      tournamentParticipants,
      inactiveDrawPositions,
      activeDrawPositions,
      positionAssignments,
      returnParticipants,
      byeDrawPositions,
      drawDefinition,
      isByePosition,
      drawPosition,
      structureId,
      structure,
      drawId,
    });
    if (validSwapAction) validActions.push(validSwapAction);
  }
}

function addAlternateAction({
  validActions,
  policyActions,
  getValidAlternatesAction,
  possiblyDisablingAction,
  tournamentParticipants,
  positionAssignments,
  activeDrawPositions,
  returnParticipants,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  structure,
  drawId,
  event,
  disablePlacementActions,
}) {
  if (isAvailableAction({ policyActions, action: ALTERNATE_PARTICIPANT }) && !disablePlacementActions) {
    const { validAlternatesAction } = getValidAlternatesAction({
      possiblyDisablingAction,
      tournamentParticipants,
      positionAssignments,
      activeDrawPositions,
      returnParticipants,
      appliedPolicies,
      drawDefinition,
      drawPosition,
      validActions,
      structureId,
      structure,
      drawId,
      event,
    });
    if (validAlternatesAction) validActions.push(validAlternatesAction);
  }
}

function addLuckyLoserAction({
  validActions,
  policyActions,
  getValidLuckyLosersAction,
  sourceStructuresComplete,
  possiblyDisablingAction,
  isWinRatioFedStructure,
  tournamentParticipants,
  activeDrawPositions,
  positionAssignments,
  drawDefinition,
  drawPosition,
  structureId,
  structure,
  drawId,
  disablePlacementActions,
  isActiveDrawPosition,
}) {
  if (
    isAvailableAction({ policyActions, action: LUCKY_PARTICIPANT }) &&
    !disablePlacementActions &&
    !isActiveDrawPosition &&
    positionAssignments
  ) {
    const { validLuckyLosersAction } = getValidLuckyLosersAction({
      sourceStructuresComplete,
      possiblyDisablingAction,
      isWinRatioFedStructure,
      tournamentParticipants,
      activeDrawPositions,
      positionAssignments,
      drawDefinition,
      drawPosition,
      structureId,
      structure,
      drawId,
    });
    if (validLuckyLosersAction) validActions.push(validLuckyLosersAction);
  }
}

function addModifyPairAssignmentAction({
  validActions,
  policyActions,
  getValidModifyAssignedPairAction,
  participant,
  tournamentParticipants,
  returnParticipants,
  drawPosition,
  drawId,
  event,
}) {
  if (participant?.participantType === PAIR && isAvailableAction({ policyActions, action: MODIFY_PAIR_ASSIGNMENT })) {
    const { validModifyAssignedPairAction } = getValidModifyAssignedPairAction({
      tournamentParticipants,
      returnParticipants,
      drawPosition,
      participant,
      drawId,
      event,
    });
    if (validModifyAssignedPairAction) validActions.push(validModifyAssignedPairAction);
  }
}

export function positionActions(params: PositionActionsArgs): ResultType & {
  isActiveDrawPosition?: boolean;
  hasPositionAssigned?: boolean;
  isDrawPosition?: boolean;
  isByePosition?: boolean;
  validActions?: any[];
} {
  return positionActionsInternal(params);
}

// Extracted main logic to reduce cognitive complexity
function positionActionsInternal(params: PositionActionsArgs): ResultType & {
  isActiveDrawPosition?: boolean;
  hasPositionAssigned?: boolean;
  isDrawPosition?: boolean;
  isByePosition?: boolean;
  validActions?: any[];
} {
  const paramsCheck = checkRequiredParameters(params, [{ event: true, drawDefinition: true, structureId: true }]);
  if (paramsCheck.error) return paramsCheck;

  const {
    policyDefinitions: specifiedPolicyDefinitions,
    returnParticipants = true,
    provisionalPositioning,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    event,
  } = params;

  const tournamentParticipants =
    params.tournamentParticipants ??
    (tournamentRecord &&
      getParticipants({
        withIndividualParticipants: true,
        tournamentRecord,
      }).participants) ??
    [];

  let result: any = findStructure({
    structureId: params.structureId,
    drawDefinition,
  });
  if (result.error) return result;

  const structure = result.containingStructure || result.structure;
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const structureId = structure.structureId;

  result = getStructureDrawPositionProfiles({
    drawDefinition,
    structureId,
  });

  if (drawPosition === undefined && !result.isAdHoc) {
    return { error: MISSING_DRAW_POSITION };
  }

  if (result.isAdHoc) return matchUpActions(params);
  if (result.error) return result;

  const { drawPositionInitialRounds, inactiveDrawPositions, activeDrawPositions, byeDrawPositions } = result;

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      structure,
      event,
    }).appliedPolicies ?? {};

  Object.assign(appliedPolicies, specifiedPolicyDefinitions ?? {});

  const {
    actionsPolicy: positionActionsPolicy,
    enabledStructures,
    actionsDisabled,
  } = getEnabledStructures({
    actionType: POSITION_ACTION,
    appliedPolicies,
    drawDefinition,
    structure,
  });

  const activePositionOverrides = positionActionsPolicy?.activePositionOverrides || [];

  const { sourceStructureIds: positionSourceStructureIds } =
    getSourceStructureIdsAndRelevantLinks({
      finishingPosition: WIN_RATIO,
      targetRoundNumber: 1,
      linkType: POSITION,
      drawDefinition,
      structureId,
    }) || {};

  let sourceStructuresComplete;
  if (positionSourceStructureIds?.length) {
    sourceStructuresComplete = positionSourceStructureIds.every((sourceStructureId) =>
      isCompletedStructure({ structureId: sourceStructureId, drawDefinition }),
    );
  }

  const isWinRatioFedStructure = positionSourceStructureIds.length;
  const disablePlacementActions = positionSourceStructureIds.length && !sourceStructuresComplete;

  const { policyActions } = getPolicyActions({
    enabledStructures,
    drawDefinition,
    structure,
  });

  const possiblyDisablingAction = ![QUALIFYING, MAIN].includes(structure.stage) || structure.stageSequence !== 1;

  const { drawId } = drawDefinition;
  const validActions: any[] = [];

  const { assignedPositions, positionAssignments } = structureAssignedDrawPositions({ structure });
  const positionAssignment = assignedPositions?.find((assignment) => assignment.drawPosition === drawPosition);
  const hasPositionAssigned = !!positionAssignment;

  const drawPositions = positionAssignments?.map((assignment) => assignment.drawPosition);

  // If drawPosition has no positionAssignment entry but is a valid matchUp drawPosition,
  // treat it as an unassigned position rather than invalid
  if (!drawPositions?.includes(drawPosition)) {
    const allMatchUpDrawPositions = structure.matchUps?.flatMap((m) => m.drawPositions || []) ?? [];
    if (!allMatchUpDrawPositions.includes(drawPosition)) return { error: INVALID_DRAW_POSITION };
  }

  const { stage, stageSequence } = structure;

  const stages = [stage];

  if (stage === CONSOLATION) stages.push(MAIN);
  if (stage === MAIN) stages.push(CONSOLATION);

  const stageEntries = getStageEntries({
    entryStatuses: DIRECT_ENTRY_STATUSES,
    provisionalPositioning,
    drawDefinition,
    stageSequence,
    structureId,
    stages,
  });

  const stageAssignedParticipantIds =
    getAssignedParticipantIds({
      drawDefinition,
      stages,
    }).assignedParticipantIds ?? [];

  const unassignedParticipantIds = getUnassignedParticipantIds(stageEntries, stageAssignedParticipantIds);

  const isByePosition = byeDrawPositions.includes(drawPosition);
  const isActiveDrawPosition = activeDrawPositions.includes(drawPosition);

  // In lucky draws, positions beyond round 1 are virtual (created by advancement).
  // Restrict actions: no withdraw, bye assignment, or seeding for these positions.
  const isLuckyDrawAdvancedPosition =
    isLuckyBasedDraw(drawDefinition.drawType) && drawPositionInitialRounds?.[drawPosition] > 1;

  if (actionsDisabled)
    return {
      info: 'Actions Disabled for structure',
      isActiveDrawPosition,
      isDrawPosition: true,
      hasPositionAssigned,
      validActions: [],
      isByePosition,
    };

  addAssignmentActions({
    validActions,
    policyActions,
    isActiveDrawPosition,
    positionAssignments,
    disablePlacementActions,
    positionAssignment,
    isByePosition,
    getValidAssignmentActions,
    positionSourceStructureIds,
    unassignedParticipantIds,
    possiblyDisablingAction,
    isWinRatioFedStructure,
    tournamentParticipants,
    returnParticipants,
    appliedPolicies,
    drawDefinition,
    drawPosition,
    structureId,
    event,
  });

  addQualifyingActions({
    validActions,
    policyActions,
    isActiveDrawPosition,
    getValidQualifiersAction,
    drawPositionInitialRounds,
    tournamentParticipants,
    positionAssignments,
    returnParticipants,
    appliedPolicies,
    drawDefinition,
    drawPosition,
    structureId,
    drawId,
  });

  const { participantId } = positionAssignment || {};
  const participant =
    participantId && tournamentParticipants.find((participant) => participant.participantId === participantId);

  if (positionAssignment) {
    addRemoveAssignmentActions({
      isLuckyDrawAdvancedPosition,
      validActions,
      policyActions,
      isActiveDrawPosition,
      drawId,
      structureId,
      drawPosition,
      possiblyDisablingAction,
      isByePosition,
    });

    if (!isLuckyDrawAdvancedPosition) {
      addSeedActions({
        validActions,
        policyActions,
        activePositionsCheck,
        activePositionOverrides,
        activeDrawPositions,
        drawDefinition,
        structureId,
        drawPosition,
        structure,
        isByePosition,
        participantId,
        participant,
        drawId,
      });
    }

    addPenaltyAndNicknameActions({
      validActions,
      policyActions,
      isByePosition,
      participantId,
      participant,
      drawId,
    });

    addSwapAction({
      validActions,
      policyActions,
      getValidSwapAction,
      possiblyDisablingAction,
      tournamentParticipants,
      inactiveDrawPositions,
      activeDrawPositions,
      positionAssignments,
      returnParticipants,
      byeDrawPositions,
      drawDefinition,
      isByePosition,
      drawPosition,
      structureId,
      structure,
      drawId,
    });
  }

  addAlternateAction({
    validActions,
    policyActions,
    getValidAlternatesAction,
    possiblyDisablingAction,
    tournamentParticipants,
    positionAssignments,
    activeDrawPositions,
    returnParticipants,
    appliedPolicies,
    drawDefinition,
    drawPosition,
    structureId,
    structure,
    drawId,
    event,
    disablePlacementActions,
  });

  addLuckyLoserAction({
    validActions,
    policyActions,
    getValidLuckyLosersAction,
    sourceStructuresComplete,
    possiblyDisablingAction,
    isWinRatioFedStructure,
    tournamentParticipants,
    activeDrawPositions,
    positionAssignments,
    drawDefinition,
    drawPosition,
    structureId,
    structure,
    drawId,
    disablePlacementActions,
    isActiveDrawPosition,
  });

  addModifyPairAssignmentAction({
    validActions,
    policyActions,
    getValidModifyAssignedPairAction,
    participant,
    tournamentParticipants,
    returnParticipants,
    drawPosition,
    drawId,
    event,
  });

  return {
    isActiveDrawPosition,
    isDrawPosition: true,
    hasPositionAssigned,
    isByePosition,
    validActions,
    ...SUCCESS,
  };
}
