import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { requireParams } from '@Helpers/parameters/requireParams';
import { uniqueValues } from '@Tools/arrays';

// constants and types
import { DrawDefinition, SeedAssignment, Tournament } from '@Types/tournamentTypes';
import { TOURNAMENT_RECORD, DRAW_ID } from '@Constants/attributeConstants';
import { SeedingProfile, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_ASSIGNMENTS,
  NO_MODIFICATIONS_APPLIED,
  INVALID_PARTICIPANT_SEEDING,
} from '@Constants/errorConditionConstants';

/*
 * Provides the ability to assign seedPositions *after* a structure has been generated
 * To be used *before* participants are positioned
 */

type AssignSeedPositionsArgs = {
  provisionalPositioning?: boolean;
  useExistingSeedLimit?: boolean;
  seedingProfile?: SeedingProfile;
  assignments: SeedAssignment[];
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  drawId: string;
  event: Event;
};
export function assignSeedPositions(
  params: AssignSeedPositionsArgs,
): ResultType | { modifications?: number; success?: boolean } {
  const {
    provisionalPositioning,
    useExistingSeedLimit,
    tournamentRecord,
    drawDefinition,
    seedingProfile,
    structureId,
    assignments,
    drawId,
    event,
  } = params;

  let modifications = 0;

  if (!assignments?.length) return { error: MISSING_ASSIGNMENTS };
  const paramsCheck = requireParams({ tournamentRecord, drawId }, [TOURNAMENT_RECORD, DRAW_ID]);
  if (paramsCheck.error) return paramsCheck;

  const result = getStructureSeedAssignments({
    provisionalPositioning,
    drawDefinition,
    structureId,
  });
  if (result.error) return result;
  const { seedAssignments, seedLimit } = result;

  /**
   * mergeObject and seedLimit ensure that new assignments do not go beyond already established number of seeds
   */
  const mergeObject = Object.assign(
    {},
    ...(seedAssignments ?? [])
      .filter((assignment) => assignment.seedNumber)
      .map((assignment) => ({ [assignment.seedNumber]: assignment })),
  );

  assignments.forEach((newAssignment) => {
    const { seedNumber } = newAssignment;
    if (seedLimit && seedNumber <= seedLimit && (!useExistingSeedLimit || mergeObject[seedNumber])) {
      mergeObject[seedNumber] = newAssignment;
    }
  });

  /**
   * ensure that no participantId is assigned to multiple seedNumbers
   */
  const updatedAssignments: any[] = Object.values(mergeObject);
  const participantIds = updatedAssignments.map((assignment) => assignment?.participantId).filter(Boolean);

  if (participantIds.length !== uniqueValues(participantIds).length) {
    return {
      error: INVALID_PARTICIPANT_SEEDING,
    };
  }

  for (const assignment of updatedAssignments) {
    const result = assignSeed({
      ...assignment,
      provisionalPositioning,
      tournamentRecord,
      drawDefinition,
      seedingProfile,
      structureId,
      event,
    });
    if (result?.error) {
      return result;
    } else if (result?.success) {
      modifications++;
    }
  }

  return modifications ? { ...SUCCESS, modifications } : { error: NO_MODIFICATIONS_APPLIED };
}
