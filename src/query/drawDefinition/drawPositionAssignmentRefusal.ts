import { getValidSeedBlocks, isValidSeedPosition, SeedBlockInfo } from '@Query/drawDefinition/seedGetter';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  INVALID_DRAW_POSITION_FOR_SEEDING,
  INVALID_DRAW_POSITION,
  MISSING_PARTICIPANT_ID,
  STRUCTURE_NOT_FOUND,
  INVALID_MATCHUP,
} from '@Constants/errorConditionConstants';

type DrawPositionAssignmentRefusalArgs = {
  /** seats the caller empties BEFORE the assignment; the participant may sit in one of them now */
  vacatedDrawPositions?: number[];
  /** the seats as the assignment will find them, when earlier steps of the caller change them */
  seats?: PositionAssignment[];
  /** the structure as the assignment will find it (its seedAssignments), when the caller changes it first */
  structure?: Structure;
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  isQualifierPosition?: boolean;
  participantId?: string;
  drawPosition: number;
  seedBlockInfo?: SeedBlockInfo;
  structureId: string;
  event?: Event;
};

/**
 * The refusals `assignDrawPosition` makes of a placement into an EMPTY seat — asked without writing.
 *
 * A position action that empties a seat (a BYE, or the participant a swap moves away) and THEN
 * assigns into it asks this first, so a placement that will be refused is refused before the seat is
 * emptied. The seat being assigned, and every seat in `vacatedDrawPositions`, is treated as empty:
 * that is the state the assignment will meet.
 *
 * Mirrors the guards at the top of `assignDrawPosition` (drawPositionPlacement.ts), in the same order
 * so the same input meets the same refusal; `drawPositionAssignmentRefusal.test.ts` holds the two
 * to agreement.
 */
export function drawPositionAssignmentRefusal({
  vacatedDrawPositions = [],
  seats,
  provisionalPositioning,
  isQualifierPosition,
  tournamentRecord,
  drawDefinition,
  participantId,
  seedBlockInfo,
  drawPosition,
  structureId,
  structure: structureOverride,
  event,
}: DrawPositionAssignmentRefusalArgs): ResultType | undefined {
  const stack = 'assignDrawPosition';

  if (!participantId && !isQualifierPosition)
    return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });

  const structure = structureOverride ?? findStructure({ drawDefinition, structureId }).structure;
  if (!structure) return decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack });

  if (isAdHoc({ structure })) return decorateResult({ result: { error: INVALID_MATCHUP }, stack });

  const { seedAssignments } = getStructureSeedAssignments({ provisionalPositioning, drawDefinition, structure });
  const seedNumber =
    participantId && seedAssignments?.find((assignment) => assignment.participantId === participantId)?.seedNumber;
  if (seedNumber) {
    const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, drawDefinition, structure, event });
    // a structure the caller has not yet written is asked for its seed blocks directly
    if (structureOverride && !seedBlockInfo)
      seedBlockInfo = getValidSeedBlocks({ appliedPolicies, drawDefinition, structure });
    const isValidDrawPosition = isValidSeedPosition({
      appliedPolicies,
      drawDefinition,
      seedBlockInfo,
      drawPosition,
      structureId,
      seedNumber,
    });
    if (!isValidDrawPosition)
      return decorateResult({ result: { error: INVALID_DRAW_POSITION_FOR_SEEDING }, context: { drawPosition }, stack });
  }

  const positionAssignments = seats ?? structureAssignedDrawPositions({ structure }).positionAssignments ?? [];
  if (!positionAssignments.some((assignment) => assignment.drawPosition === drawPosition))
    return decorateResult({ result: { error: INVALID_DRAW_POSITION }, context: { drawPosition }, stack });

  const emptied = [drawPosition, ...vacatedDrawPositions];
  const seatedElsewhere =
    participantId &&
    positionAssignments.some(
      (assignment) => assignment.participantId === participantId && !emptied.includes(assignment.drawPosition),
    );
  if (seatedElsewhere)
    return decorateResult({
      result: { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT },
      context: { drawPosition },
      stack,
    });

  return undefined;
}
