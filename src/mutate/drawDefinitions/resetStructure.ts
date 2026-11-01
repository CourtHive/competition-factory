import { clearDisableLinks, resetStructureMatchUps } from '@Mutate/drawDefinitions/resetDrawDefinition';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { structuresOf } from '@Acquire/structureMembers';

// constants and types
import {
  CANNOT_RESET_STRUCTURE,
  MISSING_DRAW_DEFINITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

interface ResetStructureArgs {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removeScheduling?: boolean;
  structureId: string;
  event?: Event;
}

/**
 * Reset the results of ONE structure: every matchUp in it returns to be played, and the positions its own played
 * matchUps delivered are removed, as `resetDrawDefinition` does for the whole draw. Its positioning stays: the
 * participants placed in it, including those fed into it by results elsewhere, which stand.
 *
 * Refused (CANNOT_RESET_STRUCTURE) where resetting the one structure would leave the draw inconsistent:
 * - the first MAIN structure while any link connects it to another structure: its results position the structures it
 *   feeds, so it is reset with the whole draw;
 * - any structure that has already delivered a participant through one of its links, e.g. a qualifying structure whose
 *   qualifiers are placed in the main draw, until they are removed there.
 */
export function resetStructure({
  removeScheduling,
  tournamentRecord,
  drawDefinition,
  structureId,
  event,
}: ResetStructureArgs): ResultType {
  const stack = 'resetStructure';
  if (!drawDefinition) return decorateResult({ result: { error: MISSING_DRAW_DEFINITION }, stack });

  const structure = drawDefinition.structures?.find((structure) => structure.structureId === structureId);
  if (!structure) return decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack });

  const links = drawDefinition.links ?? [];
  const isLinked = links.some(({ source, target }) => [source.structureId, target.structureId].includes(structureId));
  if (structure.stage === MAIN && structure.stageSequence === 1 && isLinked) {
    const info = 'main structure is linked to other structures; reset the draw';
    return decorateResult({ result: { error: CANNOT_RESET_STRUCTURE }, info, stack });
  }

  const delivered = deliveredParticipantIds({ drawDefinition, structure });
  if (delivered.length) {
    const info = 'participants from this structure are placed in a linked structure';
    return decorateResult({ result: { error: CANNOT_RESET_STRUCTURE }, context: { delivered }, info, stack });
  }

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const getRawMatchUp = (matchUpId) => matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  resetStructureMatchUps({
    isLuckyDraw: isLuckyBasedDraw(drawDefinition.drawType),
    removeAssignments: false,
    removeScheduling,
    tournamentRecord,
    drawDefinition,
    getRawMatchUp,
    matchUpsMap,
    structure,
    event,
  });

  // a round robin is a container: its positions live on its groups
  for (const member of structuresOf(structure) ?? [structure]) clearDisableLinks(member);

  modifyDrawNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    structureIds: [structureId],
    drawDefinition,
  });

  return { ...SUCCESS };
}

// the participants of this structure already placed in a structure one of its links leads to
function deliveredParticipantIds({
  drawDefinition,
  structure,
}: {
  drawDefinition: DrawDefinition;
  structure: Structure;
}) {
  const participantIdsOf = (structure?: Structure) =>
    structure
      ? getPositionAssignments({ structure })
          .positionAssignments.map(({ participantId }) => participantId)
          .filter(Boolean)
      : [];

  const own = new Set(participantIdsOf(structure));
  const targetStructureIds = (drawDefinition.links ?? [])
    .filter(({ source }) => source.structureId === structure.structureId)
    .map(({ target }) => target.structureId);

  return targetStructureIds.flatMap((targetStructureId) =>
    participantIdsOf(drawDefinition.structures?.find(({ structureId }) => structureId === targetStructureId)).filter(
      (participantId) => own.has(participantId),
    ),
  );
}
