import { deleteMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';

// Constants
import { MISSING_DRAW_DEFINITION, SCORES_PRESENT, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

interface ResetQualifyingStructureArgs {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  event?: Event;
}

export function resetQualifyingStructure({
  tournamentRecord,
  drawDefinition,
  event,
  structureId,
}: ResetQualifyingStructureArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = drawDefinition.structures?.find(
    (structure) => structure.stage === QUALIFYING && structure.structureId === structureId,
  );

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  // a round robin qualifying structure is a CONTAINER: its matchUps live on its groups
  const groups = structuresOf(structure);
  const matchUps = groups ? groups.flatMap((group) => matchUpsOf(group) ?? []) : matchUpsOf(structure);

  const scoresPresent = matchUps?.some(
    ({ matchUpStatus, score }) =>
      checkScoreHasValue({ score }) ?? (!!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus)),
  );
  if (scoresPresent) return { error: SCORES_PRESENT };

  const removedMatchUpIds = matchUps?.map(({ matchUpId }) => matchUpId) ?? [];

  structure.seedAssignments = [];
  if ('structures' in structure) {
    structure.structures = [];
  } else {
    structure.positionAssignments = [];
    structure.matchUps = [];
  }

  deleteMatchUpsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    action: 'resetVoluntaryConsolationStructure',
    matchUpIds: removedMatchUpIds,
    drawDefinition,
  });

  modifyDrawNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structureIds: [structure.structureId],
  });

  return { ...SUCCESS };
}
