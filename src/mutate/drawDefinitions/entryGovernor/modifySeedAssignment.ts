import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { modifySeedAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { findStructure } from '@Acquire/findStructure';
import { ensureInt } from '@Tools/ensureInt';
import { isNumeric } from '@Tools/math';

import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_PARTICIPANT_ID,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type ModifySeedAssignmentArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  seedValue?: string | number;
  participantId: string;
  validation?: boolean;
  structureId: string;
  event?: Event;
};
export function modifySeedAssignment({
  validation = true,
  tournamentRecord,
  drawDefinition,
  participantId,
  structureId,
  seedValue,
  event,
}: ModifySeedAssignmentArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };

  const participant = (tournamentRecord?.participants ?? []).find(
    (participant) => participant.participantId === participantId,
  );
  if (tournamentRecord && !participant) return { error: INVALID_PARTICIPANT_ID };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const validValue =
    !validation ||
    isNumeric(seedValue) ||
    seedValue === undefined ||
    seedValue === '' ||
    (typeof seedValue === 'string' && seedValue.split('-').every((v) => isNumeric(v) && ensureInt(v) > 0));

  if (!validValue) return { error: INVALID_VALUES };

  const { seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structure,
  });
  const seedNumbers = seedAssignments?.map((assignment) => assignment.seedNumber);

  const existingAssginment = seedAssignments?.find((assignment) => assignment.participantId === participantId);

  if (existingAssginment) {
    const newValue =
      typeof seedValue === 'string'
        ? (seedValue.includes('-') &&
            seedValue
              .split('-')
              .map((v) => parseInt(v))
              .join('-')) ||
          (parseInt(seedValue) > 0 && parseInt(seedValue)) ||
          ''
        : (seedValue && seedValue > 0 && seedValue) || '';
    existingAssginment.seedValue = newValue;
  } else {
    const seedNumber = Math.max(0, ...(seedNumbers ?? [])) + 1;
    const seedAssignment: any = { seedNumber, participantId };
    if (seedValue) seedAssignment.seedValue = seedValue;
    structure.seedAssignments ??= [];
    structure.seedAssignments.push(seedAssignment);
  }

  modifySeedAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structure,
  });

  return { ...SUCCESS };
}
