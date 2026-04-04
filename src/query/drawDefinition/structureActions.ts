import { getPlayoffStructures } from '../structure/structureGetter';
import { getStructureMatchUps } from '../structure/getStructureMatchUps';
import { getPositionAssignments } from './positionsGetter';

// constants and types
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/matchUpTypes';

type StructureActionsArgs = {
  drawDefinition: DrawDefinition;
  structureId: string;
};

export function structureActions(params: StructureActionsArgs) {
  const actions = [];
  if (!params?.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const isComplete = isCompletedStructure(params);
  const hasPlayoffPositionsFilled = allPlayoffPositionsFilled(params);
  return { actions, state: { isComplete, hasPlayoffPositionsFilled } };
}

type StructureQueryArgs = {
  drawDefinition: DrawDefinition;
  structure?: Structure;
  structureId?: string;
};
export function isCompletedStructure(params: StructureQueryArgs) {
  if (!params?.drawDefinition) return false;
  const structureMatchUps = getStructureMatchUps(params);

  const includesTeamMatchUps = structureMatchUps?.includesTeamMatchUps;
  let { completedMatchUps, pendingMatchUps, upcomingMatchUps } = structureMatchUps ?? {};

  if (includesTeamMatchUps) {
    completedMatchUps = completedMatchUps?.filter(({ matchUpType }) => matchUpType === TEAM);
    pendingMatchUps = pendingMatchUps?.filter(({ matchUpType }) => matchUpType === TEAM);
    upcomingMatchUps = upcomingMatchUps?.filter(({ matchUpType }) => matchUpType === TEAM);
  }

  const isComplete = completedMatchUps?.length && !pendingMatchUps?.length && !upcomingMatchUps?.length;

  return !!isComplete;
}

export function allPlayoffPositionsFilled(params: StructureActionsArgs) {
  const { drawDefinition, structureId } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { playoffStructures } = getPlayoffStructures({
    drawDefinition,
    structureId,
  });

  if (!playoffStructures?.length) return false;

  const enteredParticipantsCount =
    drawDefinition?.entries?.filter(
      (entry) => entry?.entryStatus && STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus),
    )?.length ?? 0;

  let participantIdsCount = 0;
  const allPositionsFilled = (playoffStructures ?? []).reduce((allFilled, structure) => {
    const positionAssignments = getPositionAssignments({ structure }).positionAssignments ?? [];
    const structurePositionsFilled = positionAssignments?.filter((assignment) => {
      if (assignment.participantId) participantIdsCount++;
      return assignment?.bye ?? assignment?.participantId;
    }).length;
    return !!(structurePositionsFilled && allFilled);
  }, !!playoffStructures.length);

  // account for playoffStructure with only one participant
  const allParticipantIdsPlaced = participantIdsCount === enteredParticipantsCount;

  return allPositionsFilled || allParticipantIdsPlaced;
}
