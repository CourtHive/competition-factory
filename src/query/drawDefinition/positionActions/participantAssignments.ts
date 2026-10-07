import { getNumericSeedValue } from '@Query/drawDefinition/getNumericSeedValue';
import { getNextSeedBlock } from '@Query/drawDefinition/seedGetter';
import { getParticipantId } from '@Functions/global/extractors';
import { getDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { unique } from '@Tools/arrays';

// constants and types
import { DrawDefinition, Event, PositionAssignment } from '@Types/tournamentTypes';
import { PolicyDefinitions, SeedingProfile } from '@Types/factoryTypes';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { HydratedParticipant } from '@Types/hydrated';
import { PositionAction } from './actionPolicyUtils';
import { TEAM } from '@Constants/eventConstants';
import {
  ASSIGN_BYE,
  ASSIGN_BYE_METHOD,
  ASSIGN_PARTICIPANT,
  ASSIGN_PARTICIPANT_METHOD,
} from '@Constants/positionActionConstants';

type GetValidAssignmentActionsArgs = {
  tournamentParticipants?: HydratedParticipant[];
  positionAssignments: PositionAssignment[];
  positionSourceStructureIds: string[];
  unassignedParticipantIds: string[];
  appliedPolicies?: PolicyDefinitions;
  possiblyDisablingAction?: boolean;
  provisionalPositioning?: boolean;
  isWinRatioFedStructure?: boolean;
  seedingProfile?: SeedingProfile;
  returnParticipants?: boolean;
  drawDefinition: DrawDefinition;
  isByePosition?: boolean;
  drawPosition: number;
  structureId: string;
  event?: Event;
};
export function getValidAssignmentActions({
  positionSourceStructureIds,
  unassignedParticipantIds,
  possiblyDisablingAction,
  provisionalPositioning,
  tournamentParticipants,
  isWinRatioFedStructure,
  positionAssignments,
  returnParticipants,
  appliedPolicies,
  drawDefinition,
  seedingProfile,
  isByePosition,
  drawPosition,
  structureId,
  event,
}: GetValidAssignmentActionsArgs) {
  const { drawId } = drawDefinition;
  const validAssignmentActions: PositionAction[] = [];

  let unplacedSeedParticipantIds,
    unplacedSeedAssignments,
    unfilledPositions: number[] = [];

  const ignoreSeedPositions = appliedPolicies?.[POLICY_TYPE_SEEDING]?.validSeedPositions?.ignore;

  if (!ignoreSeedPositions) {
    const result = getNextSeedBlock({
      provisionalPositioning,
      returnAllProxies: true,
      randomize: true,
      drawDefinition,
      seedingProfile,
      structureId,
      event,
    });
    ({ unplacedSeedParticipantIds, unplacedSeedAssignments, unfilledPositions } = result);
  }

  // if there are no unfilledPositions for available seeds then return all unfilled positions
  if (!unfilledPositions?.length) {
    unfilledPositions = positionAssignments
      .filter((assignment) => !assignment.participantId && !assignment.bye && !assignment.qualifier)
      .map((assignment) => assignment.drawPosition);
  }

  if (!isByePosition) {
    validAssignmentActions.push({
      payload: { drawId, structureId, drawPosition, isPositionAction: true },
      willDisableLinks: possiblyDisablingAction,
      method: ASSIGN_BYE_METHOD,
      type: ASSIGN_BYE,
    });
  }

  if (isWinRatioFedStructure && ignoreSeedPositions) {
    const assignedParticipantIds = positionAssignments.map((assignment) => assignment.participantId).filter(Boolean);

    const matchUpFilters = { structureIds: positionSourceStructureIds };
    const { completedMatchUps } = getDrawMatchUps({
      inContext: true,
      matchUpFilters,
      drawDefinition,
    });

    const availableParticipantIds = unique(
      (completedMatchUps ?? [])
        // filter completedMatchUps to exclude SINGLES/DOUBLES for TEAM events
        .filter(({ matchUpType }) => event?.eventType !== TEAM || matchUpType === TEAM)
        ?.map(({ sides }) => sides?.map(getParticipantId))
        .flat()
        .filter((participantId) => participantId && !assignedParticipantIds.includes(participantId)),
    );

    const participantsAvailable = returnParticipants
      ? tournamentParticipants
          ?.filter((participant) => availableParticipantIds?.includes(participant.participantId))
          .map((participant) => makeDeepCopy(participant, undefined, true))
      : undefined;

    participantsAvailable?.forEach((participant) => {
      const entry = (drawDefinition.entries ?? []).find((entry) => entry.participantId === participant.participantId);
      participant.entryPosition = entry?.entryPosition;
    });
    if (participantsAvailable?.length) {
      validAssignmentActions.push(
        definedAttributes({
          payload: { drawId, structureId, drawPosition },
          willDisableLinks: possiblyDisablingAction,
          method: ASSIGN_PARTICIPANT_METHOD,
          type: ASSIGN_PARTICIPANT,
          availableParticipantIds,
          participantsAvailable,
        }),
      );
    }
    return { validAssignmentActions };
  }

  if (unfilledPositions.includes(drawPosition) || isByePosition) {
    let availableParticipantIds;

    if (unplacedSeedAssignments?.length) {
      // return any valid seedAssignments
      const validToAssign = unplacedSeedAssignments.filter((seedAssignment) =>
        unplacedSeedParticipantIds?.includes(seedAssignment.participantId),
      );

      validToAssign.sort(validAssignmentsSort);
      availableParticipantIds = validToAssign.map((assignment) => assignment.participantId);
    } else {
      // otherwise look for any unplaced entries
      availableParticipantIds = unassignedParticipantIds;
    }

    // add structureId and drawPosition to the payload so the client doesn't need to discover
    const participantsAvailable = returnParticipants
      ? tournamentParticipants
          ?.filter((participant) => availableParticipantIds.includes(participant.participantId))
          .map((participant) => makeDeepCopy(participant, undefined, true))
      : undefined;
    if (participantsAvailable?.length) {
      validAssignmentActions.push(
        definedAttributes({
          payload: { drawId, structureId, drawPosition },
          willDisableLinks: possiblyDisablingAction,
          method: ASSIGN_PARTICIPANT_METHOD,
          type: ASSIGN_PARTICIPANT,
          availableParticipantIds,
          participantsAvailable,
        }),
      );
    }
  }

  return { validAssignmentActions };
}

function validAssignmentsSort(a, b) {
  if (a.bye) return -1;
  if (getNumericSeedValue(a.seedValue) < getNumericSeedValue(b.seedValue) || (a.seedValue && !b.seedValue)) return -1;
  return (a.seedNumber || 0) - (b.seedNumber || 0);
}
