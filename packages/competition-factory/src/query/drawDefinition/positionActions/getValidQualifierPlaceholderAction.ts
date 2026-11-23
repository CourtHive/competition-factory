import { getAvailableQualifyingTargets } from '@Query/drawDefinition/getAvailableQualifyingTargets';

// constants and types
import { ASSIGN_QUALIFIER, ASSIGN_QUALIFIER_METHOD } from '@Constants/positionActionConstants';
import type { DrawDefinition, PositionAssignment } from '@Types/tournamentTypes';
import type { PositionAction } from './actionPolicyUtils';

type GetValidQualifierPlaceholderActionArgs = {
  drawPositionInitialRounds: { [drawPosition: number]: number };
  positionAssignments: PositionAssignment[];
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
  drawId: string;
};

/**
 * Marks an open drawPosition as a QUALIFIER placeholder: the seat a qualifier will take.
 *
 * Offered only where it means something: the position is empty (no participant, bye or placeholder) and
 * the round it enters is fed by qualifying that still owes more qualifiers than it has seats marked for
 * them. A position freed in a full main can then be handed to the qualifying that feeds it (CA, 2026-10-09).
 */
export function getValidQualifierPlaceholderAction({
  drawPositionInitialRounds,
  positionAssignments,
  drawDefinition,
  drawPosition,
  structureId,
  drawId,
}: GetValidQualifierPlaceholderActionArgs): { validQualifierPlaceholderAction?: PositionAction } {
  const assignment = positionAssignments.find((pa) => pa.drawPosition === drawPosition);
  if (!assignment || assignment.participantId || assignment.bye || assignment.qualifier) return {};

  const roundNumber = drawPositionInitialRounds?.[drawPosition] ?? 1;
  const target = getAvailableQualifyingTargets({ drawDefinition, structureId }).targets?.find(
    (t) => t.roundNumber === roundNumber,
  );
  if (!target?.owedQualifiers) return {};

  const openQualifierSeats = positionAssignments.filter(
    (pa) => pa.qualifier && !pa.participantId && (drawPositionInitialRounds?.[pa.drawPosition] ?? 1) === roundNumber,
  ).length;
  if (target.owedQualifiers <= openQualifierSeats) return {};

  return {
    validQualifierPlaceholderAction: {
      payload: { drawId, structureId, drawPosition, qualifier: true },
      method: ASSIGN_QUALIFIER_METHOD,
      type: ASSIGN_QUALIFIER,
    },
  };
}
