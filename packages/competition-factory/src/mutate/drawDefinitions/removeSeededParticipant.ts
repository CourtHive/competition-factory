import { modifySeedAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_STRUCTURE,
  MISSING_DRAW_DEFINITION,
  MISSING_TOURNAMENT_RECORD,
  NOT_FOUND,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type RemoveSeededParticipantArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  participantId: string;
  structureId: string;
  event?: Event;
};

export function removeSeededParticipant({
  tournamentRecord,
  drawDefinition,
  participantId,
  structureId,
  event,
}: RemoveSeededParticipantArgs): ResultType {
  const stack = 'removeSeededParticipant';

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = (drawDefinition.structures ?? []).find((structure) => structure.structureId === structureId);
  if (!structure) return decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack });

  if (
    !structure.stage ||
    ![MAIN, QUALIFYING].includes(structure.stage) ||
    (structure.stage === MAIN && structure.stageSequence !== 1)
  ) {
    return decorateResult({ result: { error: INVALID_STRUCTURE }, stack });
  }

  const seedAssignment = structure.seedAssignments?.find((assignment) => assignment.participantId === participantId);

  if (!seedAssignment)
    return decorateResult({
      info: 'participant not seeded',
      result: { error: NOT_FOUND },
      context: { participantId },
    });

  seedAssignment.participantId = undefined;
  modifySeedAssignmentsNotice({
    tournamentId: tournamentRecord.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structure,
  });

  return { ...SUCCESS };
}
