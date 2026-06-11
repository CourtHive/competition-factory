import { updateAssignmentParticipantResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { TEAM } from '@Constants/matchUpTypes';
import { MISSING_DRAW_DEFINITION, MISSING_STRUCTURE_ID, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';

/**
 * Recompute and save participant-result tallies for a round-robin / ad-hoc /
 * lucky structure. Mirrors the work `modifyMatchUpScore.updateTallyIfNeeded`
 * performs after every score change, but exposed as a stand-alone mutation
 * for reconstructed draws (matchUps loaded with scores already populated
 * never fire the score-save path, so tallies are never written).
 *
 * For a CONTAINER (round-robin) each child group is tallied in isolation
 * so the resulting `tally` lands on the per-group positionAssignments — the
 * same shape the normal save path writes — which keeps the read side
 * (`getDrawData`) free of any CONTAINER-vs-ITEM special casing.
 */

type UpdateParticipantResultsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  event?: Event;
};

export function updateParticipantResults({
  tournamentRecord,
  drawDefinition,
  structureId,
  event,
}: UpdateParticipantResultsArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const targetStructures: Structure[] =
    structure.structures && structure.structureType === CONTAINER ? structure.structures : [structure];

  const isDualMatchUp =
    event?.eventType === TEAM ||
    drawDefinition.matchUpType === TEAM ||
    !!(event?.tieFormat ?? drawDefinition?.tieFormat ?? structure?.tieFormat);
  const matchUpFilters = isDualMatchUp ? { matchUpTypes: [TEAM] } : undefined;

  for (const target of targetStructures) {
    if (!target.positionAssignments?.length) continue;

    const { matchUps } = getAllStructureMatchUps({
      structure: target,
      afterRecoveryTimes: false,
      tournamentRecord,
      inContext: true,
      matchUpFilters,
      drawDefinition,
      event,
    });

    const matchUpFormat = target.matchUpFormat ?? structure.matchUpFormat ?? drawDefinition.matchUpFormat;

    const result = updateAssignmentParticipantResults({
      positionAssignments: target.positionAssignments,
      tournamentRecord,
      drawDefinition,
      matchUpFormat,
      matchUps,
      event,
    });
    if (result.error) return result;
  }

  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });
  return { ...SUCCESS };
}
