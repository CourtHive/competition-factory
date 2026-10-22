import { modifyDrawNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { drawPositionAssignmentRefusal } from '@Query/drawDefinition/drawPositionAssignmentRefusal';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { intersection } from '@Tools/arrays';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  INVALID_VALUES,
  LUCKY_DRAW_BYE_LIMIT,
  MISSING_DRAW_DEFINITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import {
  DrawDefinition,
  Event,
  PositionAssignment,
  SeedAssignment,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';

export function setPositionAssignments({
  structurePositionAssignments,
  provisionalPositioning,
  tournamentRecord,
  drawDefinition,
  event,
}: any): any {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!Array.isArray(structurePositionAssignments)) return { error: INVALID_VALUES };

  // The whole payload is validated before anything is written: every structure, every assignment, in
  // order, against the seats as the earlier assignments will have left them. A refusal leaves the
  // record as it was; nothing here snapshots or restores.
  const refusal = payloadRefusal({
    structurePositionAssignments,
    provisionalPositioning,
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (refusal) return refusal;

  for (const structureAssignments of structurePositionAssignments) {
    const { structureId, positionAssignments, seedAssignments } = structureAssignments;
    if (!positionAssignments) continue;

    const structure = findStructure({ drawDefinition, structureId }).structure as Structure; // validated above
    const recordedAssignments = getPositionAssignments({ structure }).positionAssignments;

    // a structure seeded when it was positioned (a draw generated before its entries) carries its seeds with its
    // positions, so a positioning computed apart (applyPositioning: false) is replayed whole
    if (Array.isArray(seedAssignments)) {
      structure.seedAssignments = makeDeepCopy(seedAssignments, false, true);
      structure.seedLimit = seedAssignments.length;
    }

    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    });

    for (const assignment of positionAssignments ?? []) {
      const { drawPosition, participantId, bye, qualifier } = assignment;

      if (bye) {
        const result = assignDrawPositionBye({
          tournamentRecord,
          drawDefinition,
          drawPosition,
          matchUpsMap,
          structureId,
          structure,
          event,
        });
        if (result?.error) return result;
      } else if (qualifier) {
        recordedAssignments?.forEach((assignment) => {
          if (assignment.drawPosition === drawPosition) {
            assignment.qualifier = true;
            delete assignment.participantId;
            delete assignment.bye;
            // the BYE is gone, so its provenance marker goes with it — see positionClear
            delete assignment.byeFromPropagation;
          }
        });
      } else if (participantId) {
        const result = assignDrawPosition({
          provisionalPositioning,
          inContextDrawMatchUps,
          tournamentRecord,
          drawDefinition,
          participantId,
          drawPosition,
          matchUpsMap,
          structureId,
          event,
        });
        if (result?.error) return result;
      }
    }
    modifyPositionAssignmentsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
      structure,
      event,
    });
  }

  const structureIds = structurePositionAssignments.map(({ structureId }) => structureId);
  modifyDrawNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structureIds,
  });

  return { ...SUCCESS };
}

const stack = 'setPositionAssignments';

type StructurePositionAssignments = {
  positionAssignments?: PositionAssignment[];
  seedAssignments?: SeedAssignment[];
  structureId: string;
};

type PayloadRefusalArgs = {
  structurePositionAssignments: StructurePositionAssignments[];
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
};

type AssignmentRefusalArgs = {
  provisionalPositioning?: boolean;
  assignment: PositionAssignment;
  activeDrawPositions: number[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  seats: PositionAssignment[];
  structure: Structure;
  structureId: string;
  lucky: boolean;
  event?: Event;
};

function payloadRefusal({
  structurePositionAssignments,
  provisionalPositioning,
  tournamentRecord,
  drawDefinition,
  event,
}: PayloadRefusalArgs): ResultType | undefined {
  for (const { structureId, positionAssignments, seedAssignments } of structurePositionAssignments) {
    if (!positionAssignments) continue;

    const result = findStructure({ drawDefinition, structureId });
    if (result.error) return result;
    const structure = result.structure;
    if (!structure) return { error: STRUCTURE_NOT_FOUND };

    const recordedAssignments = getPositionAssignments({ structure }).positionAssignments ?? [];
    const structureDrawPositions = recordedAssignments.map(({ drawPosition }) => drawPosition);
    const submittedDrawPositions = positionAssignments.map(({ drawPosition }) => drawPosition);
    if (intersection(structureDrawPositions, submittedDrawPositions).length !== structureDrawPositions.length) {
      return decorateResult({ result: { error: INVALID_VALUES }, info: 'drawPositions do not match', stack });
    }

    // the structure as the assignments will meet it: seeded from the payload when the payload seeds it
    const seededStructure = Array.isArray(seedAssignments)
      ? { ...structure, seedAssignments, seedLimit: seedAssignments.length }
      : structure;
    const seats: PositionAssignment[] = recordedAssignments.map((assignment) => ({ ...assignment }));
    const { activeDrawPositions } = getStructureDrawPositionProfiles({ drawDefinition, structureId });
    const context = {
      lucky: isLuckyBasedDraw(drawDefinition.drawType),
      structure: seededStructure,
      provisionalPositioning,
      activeDrawPositions,
      tournamentRecord,
      drawDefinition,
      structureId,
      seats,
      event,
    };

    for (const assignment of positionAssignments) {
      const refusal = assignmentRefusal({ assignment, ...context });
      if (refusal) return refusal;
    }
  }
  return undefined;
}

/**
 * One assignment, asked as `assignDrawPositionBye` / `assignDrawPosition` would ask it, of `seats` —
 * which it then updates as the assignment would, so the next assignment meets what this one left.
 */
function assignmentRefusal({
  provisionalPositioning,
  activeDrawPositions,
  tournamentRecord,
  drawDefinition,
  structureId,
  assignment,
  structure,
  lucky,
  seats,
  event,
}: AssignmentRefusalArgs): ResultType | undefined {
  const { drawPosition, participantId, bye, qualifier } = assignment;
  let seat = seats.find((s) => s.drawPosition === drawPosition);

  if (bye) {
    if (seat?.bye) return undefined;
    if (lucky && seats.some((s) => s.bye && s !== seat)) return { error: LUCKY_DRAW_BYE_LIMIT };
    if (activeDrawPositions.includes(drawPosition)) return { error: DRAW_POSITION_ACTIVE };
    if (seat?.participantId || seat?.qualifier) return { error: DRAW_POSITION_ASSIGNED };
    if (!seat) seats.push((seat = { drawPosition }));
    seat.bye = true;
  } else if (qualifier) {
    if (!seat) return undefined;
    seat.qualifier = true;
    delete seat.participantId;
    delete seat.bye;
  } else if (participantId) {
    const refusal = drawPositionAssignmentRefusal({
      provisionalPositioning,
      tournamentRecord,
      drawDefinition,
      participantId,
      drawPosition,
      structureId,
      structure,
      seats,
      event,
    });
    if (refusal) return refusal;
    // a seat replaced from one participant to another must not be active
    const replaces = !!seat?.participantId && seat.participantId !== participantId;
    if (replaces && activeDrawPositions.includes(drawPosition)) return { error: DRAW_POSITION_ACTIVE };
    if (seat) {
      seat.participantId = participantId;
      delete seat.bye;
    }
  }
  return undefined;
}
